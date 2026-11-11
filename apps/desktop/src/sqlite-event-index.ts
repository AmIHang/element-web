/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { DatabaseSync, type StatementSync } from "node:sqlite";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { promises as afs } from "node:fs";
import path from "node:path";

/** A Matrix event as the web app hands it to the index. */
export interface IndexedEvent {
    event_id: string;
    sender: string;
    room_id: string;
    origin_server_ts: number;
    type?: string;
    content: Record<string, unknown>;
    [key: string]: unknown;
}

/** The sender's profile at the time of the event. */
export interface IndexedProfile {
    displayname?: string;
    avatar_url?: string;
}

/** A place to resume crawling a room's history, as defined by the web app. */
export interface CrawlerCheckpoint {
    roomId: string;
    token: string;
    fullCrawl?: boolean;
    direction: string;
}

/** The search request, as built by the web app's `Searching.ts`. */
export interface SearchArgs {
    search_term: string;
    before_limit: number;
    after_limit: number;
    order_by_recency: boolean;
    room_id?: string;
    limit: number;
    next_batch?: string;
}

interface SearchContext {
    events_before: IndexedEvent[];
    events_after: IndexedEvent[];
    profile_info: Record<string, IndexedProfile>;
}

/** Search results in the shape of a server-side `room_events` search response. */
export interface SearchResult {
    count: number;
    next_batch?: string;
    highlights: string[];
    results: Array<{ rank: number; result: IndexedEvent; context: SearchContext }>;
}

/** Arguments for loading the events with files in a room. */
export interface LoadFileArgs {
    roomId: string;
    limit: number;
    fromEvent?: string;
    direction?: string;
}

/** An event together with the sender's profile. */
export interface EventAndProfile {
    event: IndexedEvent;
    profile: IndexedProfile;
}

/** The same numbers Seshat reports for the "Message search" settings. */
export interface IndexStats {
    size: number;
    eventCount: number;
    roomCount: number;
}

/** File name of the database inside the index directory. */
export const SQLITE_EVENT_INDEX_FILE = "events.sqlite";

// Increase when the tables change in a way older data cannot be read with.
const SCHEMA_VERSION = 1;

// The trigram tokenizer cannot match terms shorter than this.
const MIN_TRIGRAM_LENGTH = 3;

const KEY_CHECK_PLAINTEXT = "element-event-index";

interface EventRow {
    id: number;
    event_id: string;
    room_id: string;
    ts: number;
    data: Uint8Array;
}

/**
 * The message search index, kept in SQLite with an FTS5 full-text table that uses the trigram tokenizer.
 *
 * Unlike Seshat's word index, the trigram index finds any part of a word: "deploy" finds "deployment" and
 * "RoomState" finds "useRoomState". It uses the SQLite built into Electron, so no native module is needed.
 *
 * The full-text table is contentless: it keeps only the trigrams, not the messages. The events themselves,
 * which the search results are built from, are stored encrypted with AES-256-GCM under a key derived from the
 * passphrase. The trigrams are not encrypted, so the index still reveals parts of the message text to someone
 * who can read the file; it relies on the file being in the user's own local application data.
 *
 * The methods mirror the subset of the Seshat API that `seshat.ts` uses, so the web app can use either.
 */
export class SqliteEventIndex {
    private readonly db: DatabaseSync;
    private readonly key: Buffer;
    private readonly statements: Record<string, StatementSync>;

    /**
     * Open or create the index.
     *
     * @param dbPath - Path of the database file, or `:memory:`.
     * @param passphrase - Secret the event encryption key is derived from.
     * @throws if the database was created with a different passphrase.
     */
    public constructor(
        private readonly dbPath: string,
        passphrase: string,
    ) {
        this.db = new DatabaseSync(dbPath);
        try {
            this.db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
            this.createTables();
            this.key = this.deriveKey(passphrase);
            this.statements = this.prepareStatements();
        } catch (e) {
            // Close the file, or Windows keeps it locked and the index cannot be deleted and recreated.
            this.db.close();
            throw e;
        }
    }

    private createTables(): void {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value BLOB);
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY,
                event_id TEXT NOT NULL UNIQUE,
                room_id TEXT NOT NULL,
                sender TEXT NOT NULL,
                ts INTEGER NOT NULL,
                has_file INTEGER NOT NULL DEFAULT 0,
                data BLOB NOT NULL
            );
            CREATE INDEX IF NOT EXISTS events_room_ts ON events (room_id, ts);
            CREATE INDEX IF NOT EXISTS events_ts ON events (ts);
            CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(
                body, tokenize = 'trigram', content = '', contentless_delete = 1
            );
            CREATE TABLE IF NOT EXISTS checkpoints (
                room_id TEXT NOT NULL,
                token TEXT NOT NULL,
                full_crawl INTEGER NOT NULL,
                direction TEXT NOT NULL,
                PRIMARY KEY (room_id, token, direction)
            );
        `);

        const schemaVersion = this.getMeta("schema_version");
        if (schemaVersion === undefined) {
            this.setMeta("schema_version", SCHEMA_VERSION);
        } else if (Number(schemaVersion) !== SCHEMA_VERSION) {
            throw new Error(`Unsupported event index schema version ${String(Number(schemaVersion))}`);
        }
    }

    /** Derive the encryption key, and check it against the one the database was created with. */
    private deriveKey(passphrase: string): Buffer {
        const storedSalt = this.getMeta("salt");
        let salt: Uint8Array;
        if (storedSalt instanceof Uint8Array) {
            salt = storedSalt;
        } else {
            salt = randomBytes(16);
            this.setMeta("salt", salt);
        }
        const key = Buffer.from(hkdfSync("sha256", passphrase, salt, "element-event-index-v1", 32));

        const check = this.getMeta("key_check");
        if (check instanceof Uint8Array) {
            let ok = false;
            try {
                ok = decrypt(key, check).toString("utf8") === KEY_CHECK_PLAINTEXT;
            } catch {
                ok = false;
            }
            if (!ok) throw new Error("The event index passphrase is wrong");
        } else {
            this.setMeta("key_check", encrypt(key, Buffer.from(KEY_CHECK_PLAINTEXT, "utf8")));
        }
        return key;
    }

    private prepareStatements(): Record<string, StatementSync> {
        const s = (sql: string): StatementSync => this.db.prepare(sql);
        return {
            findEvent: s("SELECT id FROM events WHERE event_id = ?"),
            insertEvent: s(
                "INSERT INTO events (event_id, room_id, sender, ts, has_file, data) VALUES (?, ?, ?, ?, ?, ?)",
            ),
            insertFts: s("INSERT INTO events_fts (rowid, body) VALUES (?, ?)"),
            deleteEvent: s("DELETE FROM events WHERE id = ?"),
            deleteFts: s("DELETE FROM events_fts WHERE rowid = ?"),
            addCheckpoint: s(
                "INSERT OR REPLACE INTO checkpoints (room_id, token, full_crawl, direction) VALUES (?, ?, ?, ?)",
            ),
            removeCheckpoint: s("DELETE FROM checkpoints WHERE room_id = ? AND token = ? AND direction = ?"),
            loadCheckpoints: s("SELECT room_id, token, full_crawl, direction FROM checkpoints"),
            countEvents: s("SELECT COUNT(*) AS n FROM events"),
            countRooms: s("SELECT COUNT(DISTINCT room_id) AS n FROM events"),
            countCheckpoints: s("SELECT COUNT(*) AS n FROM checkpoints"),
            roomHasEvents: s("SELECT 1 FROM events WHERE room_id = ? LIMIT 1"),
            roomHasCheckpoints: s("SELECT 1 FROM checkpoints WHERE room_id = ? LIMIT 1"),
            eventsBefore: s(
                "SELECT id, event_id, room_id, ts, data FROM events WHERE room_id = ? AND ts < ? ORDER BY ts DESC LIMIT ?",
            ),
            eventsAfter: s(
                "SELECT id, event_id, room_id, ts, data FROM events WHERE room_id = ? AND ts > ? ORDER BY ts ASC LIMIT ?",
            ),
            eventTs: s("SELECT ts FROM events WHERE event_id = ? AND room_id = ?"),
            fileEventsLatest: s(
                "SELECT id, event_id, room_id, ts, data FROM events WHERE room_id = ? AND has_file = 1 ORDER BY ts DESC LIMIT ?",
            ),
            fileEventsBefore: s(
                "SELECT id, event_id, room_id, ts, data FROM events WHERE room_id = ? AND has_file = 1 AND ts < ? ORDER BY ts DESC LIMIT ?",
            ),
            fileEventsAfter: s(
                "SELECT id, event_id, room_id, ts, data FROM events WHERE room_id = ? AND has_file = 1 AND ts > ? ORDER BY ts ASC LIMIT ?",
            ),
        };
    }

    private getMeta(key: string): unknown {
        const row = this.db.prepare("SELECT value FROM meta WHERE key = ?").get(key);
        return row?.value ?? undefined;
    }

    private setMeta(key: string, value: string | number | Uint8Array): void {
        this.db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run(key, value);
    }

    /**
     * Add an event to the index. Events without searchable text are skipped, as Seshat does.
     *
     * @returns true if the event was already in the index.
     */
    private insertEvent(event: IndexedEvent, profile: IndexedProfile | undefined): boolean {
        if (this.statements.findEvent.get(event.event_id)) return true;

        const text = searchableText(event);
        if (text === "") return false;

        const data = encrypt(this.key, Buffer.from(JSON.stringify({ event, profile: profile ?? {} }), "utf8"));
        const { lastInsertRowid } = this.statements.insertEvent.run(
            event.event_id,
            event.room_id,
            event.sender,
            event.origin_server_ts,
            hasFile(event) ? 1 : 0,
            data,
        );
        this.statements.insertFts.run(lastInsertRowid, text);
        return false;
    }

    private transaction<T>(fn: () => T): T {
        this.db.exec("BEGIN");
        try {
            const result = fn();
            this.db.exec("COMMIT");
            return result;
        } catch (e) {
            this.db.exec("ROLLBACK");
            throw e;
        }
    }

    /** Add a live event to the index. Seshat queues these until `commit`; this writes them straight away. */
    public addEvent(event: IndexedEvent, profile?: IndexedProfile): void {
        this.insertEvent(event, profile);
    }

    /** Live events are written as they arrive, so there is nothing left to commit. */
    public async commit(): Promise<number> {
        return 0;
    }

    /**
     * Remove an event, for example after it was redacted.
     *
     * @returns true if the event was in the index.
     */
    public async deleteEvent(eventId: string): Promise<boolean> {
        const row = this.statements.findEvent.get(eventId);
        if (!row) return false;
        this.transaction(() => {
            this.statements.deleteFts.run(row.id);
            this.statements.deleteEvent.run(row.id);
        });
        return true;
    }

    /**
     * Add a batch of events the crawler fetched from a room's history, and move the crawler checkpoint.
     *
     * @returns true if every event was already in the index, which tells the crawler it has caught up.
     */
    public async addHistoricEvents(
        events: EventAndProfile[],
        newCheckpoint?: CrawlerCheckpoint | null,
        oldCheckpoint?: CrawlerCheckpoint | null,
    ): Promise<boolean> {
        return this.transaction(() => {
            let allExisted = events.length > 0;
            for (const { event, profile } of events) {
                if (!this.insertEvent(event, profile)) allExisted = false;
            }
            if (oldCheckpoint) this.removeCheckpoint(oldCheckpoint);
            if (newCheckpoint) this.addCheckpoint(newCheckpoint);
            return allExisted;
        });
    }

    private addCheckpoint(checkpoint: CrawlerCheckpoint): void {
        this.statements.addCheckpoint.run(
            checkpoint.roomId,
            checkpoint.token,
            checkpoint.fullCrawl ? 1 : 0,
            checkpoint.direction,
        );
    }

    private removeCheckpoint(checkpoint: CrawlerCheckpoint): void {
        this.statements.removeCheckpoint.run(checkpoint.roomId, checkpoint.token, checkpoint.direction);
    }

    public async addCrawlerCheckpoint(checkpoint: CrawlerCheckpoint): Promise<void> {
        this.addCheckpoint(checkpoint);
    }

    public async removeCrawlerCheckpoint(checkpoint: CrawlerCheckpoint): Promise<void> {
        this.removeCheckpoint(checkpoint);
    }

    public async loadCheckpoints(): Promise<CrawlerCheckpoint[]> {
        return this.statements.loadCheckpoints.all().map((row) => ({
            roomId: String(row.room_id),
            token: String(row.token),
            fullCrawl: row.full_crawl === 1,
            direction: String(row.direction),
        }));
    }

    /** True if the index has neither events nor rooms left to crawl. */
    public async isEmpty(): Promise<boolean> {
        return (
            Number(this.statements.countEvents.get()?.n) === 0 &&
            Number(this.statements.countCheckpoints.get()?.n) === 0
        );
    }

    /** True if the room has events in the index or is waiting to be crawled. */
    public async isRoomIndexed(roomId: string): Promise<boolean> {
        return (
            this.statements.roomHasEvents.get(roomId) !== undefined ||
            this.statements.roomHasCheckpoints.get(roomId) !== undefined
        );
    }

    public async getStats(): Promise<IndexStats> {
        return {
            size: await this.getSize(),
            eventCount: Number(this.statements.countEvents.get()?.n),
            roomCount: Number(this.statements.countRooms.get()?.n),
        };
    }

    private async getSize(): Promise<number> {
        if (this.dbPath === ":memory:") return 0;
        let size = 0;
        // The write-ahead log holds recent writes until SQLite moves them into the main file.
        for (const file of [this.dbPath, `${this.dbPath}-wal`]) {
            try {
                size += (await afs.stat(file)).size;
            } catch {
                // The log does not always exist.
            }
        }
        return size;
    }

    public async getUserVersion(): Promise<number> {
        return Number(this.getMeta("user_version") ?? 0);
    }

    public async setUserVersion(version: number): Promise<void> {
        this.setMeta("user_version", version);
    }

    /**
     * Search the index.
     *
     * Every word of the search term must appear somewhere in the message, as a whole word or part of one, in
     * any letter case. Words of three letters or more are looked up in the trigram index; shorter ones are
     * checked against the decrypted message text, since trigrams cannot match them.
     */
    public async search(args: SearchArgs): Promise<SearchResult> {
        const terms = splitSearchTerm(args.search_term);
        const highlights = terms;
        if (terms.length === 0) return { count: 0, highlights, results: [] };

        const longTerms = terms.filter((t) => t.length >= MIN_TRIGRAM_LENGTH);
        const shortTerms = terms.filter((t) => t.length < MIN_TRIGRAM_LENGTH).map((t) => t.toLocaleLowerCase());

        let matches = this.findCandidates(longTerms, args.room_id, args.order_by_recency);
        if (shortTerms.length > 0) {
            // Check every candidate, so that the count and the paging are exact.
            matches = matches.filter((row) => {
                const text = searchableText(this.decryptRow(row).event).toLocaleLowerCase();
                return shortTerms.every((t) => text.includes(t));
            });
        }

        const offset = Math.max(0, Number.parseInt(args.next_batch ?? "0", 10) || 0);
        const end = offset + Math.max(1, args.limit);
        const results = matches.slice(offset, end).map((row, i) => {
            const { event, profile } = this.decryptRow(row);
            return {
                rank: matches.length - offset - i,
                result: event,
                context: this.loadContext(row, event, profile, args),
            };
        });

        const nextBatch = end < matches.length ? String(end) : undefined;
        return { count: matches.length, next_batch: nextBatch, highlights, results };
    }

    /** The rows that can match: everything containing the long words, or every event if there are none. */
    private findCandidates(longTerms: string[], roomId: string | undefined, byRecency: boolean): EventRow[] {
        const params: Array<string | number> = [];
        let sql: string;
        if (longTerms.length > 0) {
            sql = "SELECT e.id, e.event_id, e.room_id, e.ts, e.data FROM events_fts f JOIN events e ON e.id = f.rowid";
            sql += " WHERE events_fts MATCH ?";
            params.push(longTerms.map(quoteFtsPhrase).join(" AND "));
            if (roomId) {
                sql += " AND e.room_id = ?";
                params.push(roomId);
            }
            sql += byRecency ? " ORDER BY e.ts DESC" : " ORDER BY bm25(events_fts), e.ts DESC";
        } else {
            sql = "SELECT id, event_id, room_id, ts, data FROM events";
            if (roomId) {
                sql += " WHERE room_id = ?";
                params.push(roomId);
            }
            sql += " ORDER BY ts DESC";
        }
        return this.db.prepare(sql).all(...params) as unknown as EventRow[];
    }

    private loadContext(row: EventRow, event: IndexedEvent, profile: IndexedProfile, args: SearchArgs): SearchContext {
        const profileInfo: Record<string, IndexedProfile> = { [event.sender]: profile };
        const load = (statement: StatementSync, limit: number): IndexedEvent[] => {
            if (limit <= 0) return [];
            return (statement.all(row.room_id, row.ts, limit) as unknown as EventRow[]).map((r) => {
                const decrypted = this.decryptRow(r);
                profileInfo[decrypted.event.sender] ??= decrypted.profile;
                return decrypted.event;
            });
        };
        return {
            events_before: load(this.statements.eventsBefore, args.before_limit),
            events_after: load(this.statements.eventsAfter, args.after_limit),
            profile_info: profileInfo,
        };
    }

    /**
     * Load the events with files in a room, for the room's file panel, newest first.
     *
     * Paging starts after `fromEvent`, backwards in time unless `direction` is "f".
     */
    public async loadFileEvents(args: LoadFileArgs): Promise<EventAndProfile[]> {
        let rows: EventRow[];
        const from = args.fromEvent ? this.statements.eventTs.get(args.fromEvent, args.roomId) : undefined;
        if (!from) {
            rows = this.statements.fileEventsLatest.all(args.roomId, args.limit) as unknown as EventRow[];
        } else if (args.direction === "f") {
            rows = this.statements.fileEventsAfter.all(args.roomId, from.ts, args.limit) as unknown as EventRow[];
            rows.reverse();
        } else {
            rows = this.statements.fileEventsBefore.all(args.roomId, from.ts, args.limit) as unknown as EventRow[];
        }
        return rows.map((r) => this.decryptRow(r));
    }

    private decryptRow(row: EventRow): EventAndProfile {
        return JSON.parse(decrypt(this.key, row.data).toString("utf8")) as EventAndProfile;
    }

    /** Close the database. The index cannot be used afterwards. */
    public async shutdown(): Promise<void> {
        if (this.db.isOpen) this.db.close();
    }
}

/** The text of an event that search looks at: message bodies, file names, room names and topics. */
export function searchableText(event: IndexedEvent): string {
    const content = event.content ?? {};
    const parts: string[] = [];
    for (const field of ["body", "filename", "name", "topic"]) {
        const value = content[field];
        if (typeof value === "string" && value !== "") parts.push(value);
    }
    return parts.join("\n");
}

function hasFile(event: IndexedEvent): boolean {
    const content = event.content ?? {};
    const file = content.file as { url?: unknown } | undefined;
    return typeof content.url === "string" || typeof file?.url === "string";
}

/**
 * Split the search term into words. Quoted text is kept together, so `"merge conflict"` finds the phrase.
 */
export function splitSearchTerm(term: string): string[] {
    const words: string[] = [];
    for (const match of term.matchAll(/"([^"]*)"|(\S+)/g)) {
        const word = (match[1] ?? match[2]).trim();
        if (word !== "") words.push(word);
    }
    return words;
}

/** Quote text as an FTS5 phrase, so characters like `-`, `:` or `*` are matched literally. */
function quoteFtsPhrase(text: string): string {
    return `"${text.replaceAll('"', '""')}"`;
}

function encrypt(key: Buffer, plaintext: Buffer): Buffer {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

function decrypt(key: Buffer, data: Uint8Array): Buffer {
    const buffer = Buffer.from(data);
    const decipher = createDecipheriv("aes-256-gcm", key, buffer.subarray(0, 12));
    decipher.setAuthTag(buffer.subarray(12, 28));
    return Buffer.concat([decipher.update(buffer.subarray(28)), decipher.final()]);
}

/**
 * The directory of the SQLite index. On Windows it is in the local application data, like the agent data, so it
 * is never copied to other computers with a roaming profile.
 */
export function getSqliteEventIndexPath(userData: string, localAppData: string | undefined): string {
    return localAppData
        ? path.join(localAppData, path.basename(userData), "EventIndex")
        : path.join(userData, "EventIndex");
}
