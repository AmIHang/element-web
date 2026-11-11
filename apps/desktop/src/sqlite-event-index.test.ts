/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
    getSqliteEventIndexPath,
    type IndexedEvent,
    type SearchArgs,
    searchableText,
    splitSearchTerm,
    SqliteEventIndex,
} from "./sqlite-event-index.js";

const ROOM = "!room:localhost";
const OTHER_ROOM = "!other:localhost";

function message(id: number, body: string, roomId = ROOM, extra: Record<string, unknown> = {}): IndexedEvent {
    return {
        event_id: `$event${id}`,
        sender: id % 2 ? "@alice:localhost" : "@bob:localhost",
        room_id: roomId,
        origin_server_ts: 1000 + id,
        type: "m.room.message",
        content: { msgtype: "m.text", body, ...extra },
    };
}

function searchArgs(term: string, overrides: Partial<SearchArgs> = {}): SearchArgs {
    return {
        search_term: term,
        before_limit: 1,
        after_limit: 1,
        order_by_recency: true,
        limit: 10,
        ...overrides,
    };
}

async function search(index: SqliteEventIndex, term: string, overrides: Partial<SearchArgs> = {}): Promise<string[]> {
    const result = await index.search(searchArgs(term, overrides));
    return result.results.map((r) => r.result.event_id);
}

describe("SqliteEventIndex", () => {
    let index: SqliteEventIndex;

    beforeEach(() => {
        index = new SqliteEventIndex(":memory:", "secret");
    });

    afterEach(async () => {
        await index.shutdown();
    });

    it("finds parts of words in any letter case", async () => {
        index.addEvent(message(1, "Fixed the deployment script"));
        index.addEvent(message(2, "Call useRoomState in the hook"));
        index.addEvent(message(3, "Die Datenbankmigration ist durch"));

        expect(await search(index, "deploy")).toEqual(["$event1"]);
        expect(await search(index, "roomstate")).toEqual(["$event2"]);
        expect(await search(index, "MIGRATION")).toEqual(["$event3"]);
    });

    it("requires every word and keeps quoted phrases together", async () => {
        index.addEvent(message(1, "merge conflict in package.json"));
        index.addEvent(message(2, "conflict resolved, merge done"));

        expect(await search(index, "merge conflict")).toEqual(["$event2", "$event1"]);
        expect(await search(index, '"merge conflict"')).toEqual(["$event1"]);
        expect(await search(index, "merge missing")).toEqual([]);
    });

    it("matches FTS5 operators and punctuation literally", async () => {
        index.addEvent(message(1, "see src/foo-bar.ts: NOT AND OR *"));

        expect(await search(index, "foo-bar.ts:")).toEqual(["$event1"]);
        expect(await search(index, "NOT")).toEqual(["$event1"]);
        expect(await search(index, '"a""b')).toEqual([]);
    });

    it("finds words shorter than three letters", async () => {
        index.addEvent(message(1, "CI is red"));
        index.addEvent(message(2, "QA passed"));
        index.addEvent(message(3, "the CI pipeline passed"));

        expect(await search(index, "ci")).toEqual(["$event3", "$event1"]);
        expect(await search(index, "ci passed")).toEqual(["$event3"]);

        const first = await index.search(searchArgs("ci", { limit: 1 }));
        expect(first.count).toBe(2);
        const second = await index.search(searchArgs("ci", { limit: 1, next_batch: first.next_batch }));
        expect(second.results.map((r) => r.result.event_id)).toEqual(["$event1"]);
        expect(second.next_batch).toBeUndefined();
    });

    it("searches file names, room names and topics", async () => {
        index.addEvent(message(1, "screenshot.png", ROOM, { msgtype: "m.image", url: "mxc://x/y" }));
        index.addEvent({ ...message(2, ""), type: "m.room.topic", content: { topic: "Backend standup" } });

        expect(await search(index, "screenshot")).toEqual(["$event1"]);
        expect(await search(index, "standup")).toEqual(["$event2"]);
    });

    it("skips events without text", async () => {
        index.addEvent({ ...message(1, ""), content: { membership: "join" } });

        expect(await index.isEmpty()).toBe(true);
    });

    it("limits the search to one room", async () => {
        index.addEvent(message(1, "release notes"));
        index.addEvent(message(2, "release notes", OTHER_ROOM));

        expect(await search(index, "release", { room_id: OTHER_ROOM })).toEqual(["$event2"]);
        expect(await search(index, "re", { room_id: ROOM })).toEqual(["$event1"]);
    });

    it("pages through results with next_batch", async () => {
        for (let i = 1; i <= 5; i++) index.addEvent(message(i, `build ${i}`));

        const first = await index.search(searchArgs("build", { limit: 2 }));
        expect(first.count).toBe(5);
        expect(first.results.map((r) => r.result.event_id)).toEqual(["$event5", "$event4"]);

        const second = await index.search(searchArgs("build", { limit: 2, next_batch: first.next_batch }));
        expect(second.results.map((r) => r.result.event_id)).toEqual(["$event3", "$event2"]);

        const last = await index.search(searchArgs("build", { limit: 2, next_batch: second.next_batch }));
        expect(last.results.map((r) => r.result.event_id)).toEqual(["$event1"]);
        expect(last.next_batch).toBeUndefined();
    });

    it("orders by relevance when not ordering by recency", async () => {
        index.addEvent(message(1, "token token token"));
        index.addEvent(message(2, "a token in a much longer message about something else entirely"));

        expect(await search(index, "token", { order_by_recency: false })).toEqual(["$event1", "$event2"]);
    });

    it("returns the surrounding events, profiles and highlights", async () => {
        index.addEvent(message(1, "before"), { displayname: "Alice" });
        index.addEvent(message(2, "the match"), { displayname: "Bob" });
        index.addEvent(message(3, "after"), { displayname: "Alice" });

        const result = await index.search(searchArgs("match"));

        expect(result.highlights).toEqual(["match"]);
        const [hit] = result.results;
        expect(hit.result.content.body).toBe("the match");
        expect(hit.context.events_before.map((e) => e.event_id)).toEqual(["$event1"]);
        expect(hit.context.events_after.map((e) => e.event_id)).toEqual(["$event3"]);
        expect(hit.context.profile_info).toEqual({
            "@bob:localhost": { displayname: "Bob" },
            "@alice:localhost": { displayname: "Alice" },
        });
    });

    it("removes deleted events from the search", async () => {
        index.addEvent(message(1, "secret plan"));

        expect(await index.deleteEvent("$event1")).toBe(true);
        expect(await index.deleteEvent("$event1")).toBe(false);
        expect(await search(index, "secret")).toEqual([]);
        expect(await index.isEmpty()).toBe(true);
    });

    it("tells the crawler when a batch was already indexed and moves the checkpoint", async () => {
        const oldCheckpoint = { roomId: ROOM, token: "t1", fullCrawl: false, direction: "b" };
        const newCheckpoint = { roomId: ROOM, token: "t2", fullCrawl: true, direction: "b" };
        await index.addCrawlerCheckpoint(oldCheckpoint);
        const batch = [1, 2].map((i) => ({ event: message(i, `old ${i}`), profile: {} }));

        expect(await index.addHistoricEvents(batch, newCheckpoint, oldCheckpoint)).toBe(false);
        expect(await index.loadCheckpoints()).toEqual([newCheckpoint]);
        expect(await index.addHistoricEvents(batch, null, newCheckpoint)).toBe(true);
        expect(await index.loadCheckpoints()).toEqual([]);
        expect(await index.addHistoricEvents([], null, null)).toBe(false);
    });

    it("reports whether rooms are indexed and the stats", async () => {
        expect(await index.isRoomIndexed(ROOM)).toBe(false);
        await index.addCrawlerCheckpoint({ roomId: OTHER_ROOM, token: "t", direction: "b" });
        index.addEvent(message(1, "hello"));

        expect(await index.isRoomIndexed(ROOM)).toBe(true);
        expect(await index.isRoomIndexed(OTHER_ROOM)).toBe(true);
        expect(await index.getStats()).toEqual({ size: 0, eventCount: 1, roomCount: 1 });
    });

    it("stores the user version", async () => {
        expect(await index.getUserVersion()).toBe(0);
        await index.setUserVersion(2);
        expect(await index.getUserVersion()).toBe(2);
    });

    it("loads file events in both directions", async () => {
        for (let i = 1; i <= 4; i++) {
            index.addEvent(message(i, `file${i}.txt`, ROOM, { msgtype: "m.file", file: { url: `mxc://x/${i}` } }));
        }
        index.addEvent(message(5, "no file here"));
        const ids = (events: Array<{ event: IndexedEvent }>): string[] => events.map((e) => e.event.event_id);

        expect(ids(await index.loadFileEvents({ roomId: ROOM, limit: 2 }))).toEqual(["$event4", "$event3"]);
        expect(ids(await index.loadFileEvents({ roomId: ROOM, limit: 2, fromEvent: "$event3" }))).toEqual([
            "$event2",
            "$event1",
        ]);
        expect(
            ids(await index.loadFileEvents({ roomId: ROOM, limit: 5, fromEvent: "$event2", direction: "f" })),
        ).toEqual(["$event4", "$event3"]);
    });

    describe("on disk", () => {
        let dir: string;

        beforeEach(() => {
            dir = mkdtempSync(path.join(tmpdir(), "event-index-"));
        });

        afterEach(() => {
            rmSync(dir, { recursive: true, force: true });
        });

        it("keeps events across restarts and rejects a wrong passphrase", async () => {
            const dbPath = path.join(dir, "events.sqlite");
            const first = new SqliteEventIndex(dbPath, "secret");
            first.addEvent(message(1, "persisted message"));
            expect((await first.getStats()).size).toBeGreaterThan(0);
            await first.shutdown();

            expect(() => new SqliteEventIndex(dbPath, "wrong")).toThrow("passphrase is wrong");

            const second = new SqliteEventIndex(dbPath, "secret");
            expect(await search(second, "persisted")).toEqual(["$event1"]);
            await second.shutdown();
        });
    });
});

describe("splitSearchTerm", () => {
    it("splits on whitespace and keeps quoted phrases", () => {
        expect(splitSearchTerm('  foo "bar baz"  qux "" ')).toEqual(["foo", "bar baz", "qux"]);
    });
});

describe("searchableText", () => {
    it("ignores fields that are not text", () => {
        expect(searchableText({ ...message(1, "hi"), content: { body: 5, name: "Room" } })).toBe("Room");
    });
});

describe("getSqliteEventIndexPath", () => {
    it("uses the local application data when there is one", () => {
        expect(getSqliteEventIndexPath(path.join("roaming", "Element"), "local")).toBe(
            path.join("local", "Element", "EventIndex"),
        );
        expect(getSqliteEventIndexPath(path.join("data", "Element"), undefined)).toBe(
            path.join("data", "Element", "EventIndex"),
        );
    });
});
