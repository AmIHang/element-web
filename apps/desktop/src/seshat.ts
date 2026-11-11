/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { app, ipcMain } from "electron";
import { promises as afs } from "node:fs";
import path from "node:path";

import type {
    Seshat as SeshatType,
    SeshatRecovery as SeshatRecoveryType,
    ReindexError as ReindexErrorType,
} from "@matrix-org/seshat";
import IpcMainEvent = Electron.IpcMainEvent;
import { randomArray } from "./utils.js";
import Store from "./store.js";
import { initEventIndex } from "./seshat-index.js";
import { getSqliteEventIndexPath, SQLITE_EVENT_INDEX_FILE, SqliteEventIndex } from "./sqlite-event-index.js";
import { SUBSTRING_TOKENIZER_MODE } from "./seshat-config.js";

let seshatSupported = false;
let Seshat: typeof SeshatType;
let SeshatRecovery: typeof SeshatRecoveryType;
let ReindexError: typeof ReindexErrorType;

try {
    const seshatModule = await import("@matrix-org/seshat");
    Seshat = seshatModule.Seshat;
    SeshatRecovery = seshatModule.SeshatRecovery;
    ReindexError = seshatModule.ReindexError;
    seshatSupported = true;
} catch (e) {
    if ((<NodeJS.ErrnoException>e).code === "MODULE_NOT_FOUND") {
        console.log("Seshat isn't installed, event indexing is disabled.");
    } else {
        console.warn("Seshat unexpected error:", e);
    }
}

// Seshat, or the SQLite index when the user picked the substring search mode.
let eventIndex: SeshatType | SqliteEventIndex | null = null;

/** The directory of the SQLite index, resolved after --profile has been applied. */
function getSqliteIndexDir(): string {
    const localAppData = process.platform === "win32" ? process.env.LOCALAPPDATA : undefined;
    return getSqliteEventIndexPath(app.getPath("userData"), localAppData);
}

const seshatDefaultPassphrase = "DEFAULT_PASSPHRASE";
async function getOrCreatePassphrase(store: Store, key: string): Promise<string> {
    try {
        const storedPassphrase = await store.getSecret(key);
        if (storedPassphrase !== undefined) {
            return storedPassphrase;
        }
    } catch (e) {
        console.error("Error getting the event index passphrase out of the secret store", e);
    }

    try {
        const newPassphrase = await randomArray(32);
        await store.setSecret(key, newPassphrase);
        return newPassphrase;
    } catch (e) {
        console.error("Error creating new event index passphrase, using default", e);
    }

    return seshatDefaultPassphrase;
}

const deleteContents = async (p: string): Promise<void> => {
    try {
        for (const entry of await afs.readdir(p)) {
            const curPath = path.join(p, entry);
            try {
                await afs.unlink(curPath);
            } catch (e) {
                console.log("Error deleting a file in EventStore directory", e);
            }
        }
    } catch (e) {
        console.log("Error reading the files in EventStore directory", e);
    }
};

ipcMain.on("seshat", async function (_ev: IpcMainEvent, payload): Promise<void> {
    const store = Store.instance;
    if (!global.mainWindow || !store) return;

    // We do this here to ensure we get the path after --profile has been resolved
    const eventStorePath = path.join(app.getPath("userData"), "EventStore");

    const sendError = (id: string, e: Error): void => {
        const error = {
            message: e.message,
        };

        global.mainWindow?.webContents.send("seshatReply", { id, error });
    };

    const args = payload.args || [];
    let ret: any;

    switch (payload.name) {
        case "supportsEventIndexing":
            // The SQLite index needs no extra module, but the default search mode still uses Seshat.
            ret = seshatSupported;
            break;

        case "initEventIndex":
            if (eventIndex === null) {
                const userId = args[0];
                const deviceId = args[1];
                const tokenizerMode = args[2] as string | undefined;
                const passphraseKey = `seshat|${userId}|${deviceId}`;

                const passphrase = await getOrCreatePassphrase(store, passphraseKey);

                if (tokenizerMode === SUBSTRING_TOKENIZER_MODE) {
                    try {
                        const dir = getSqliteIndexDir();
                        await afs.mkdir(dir, { recursive: true });
                        eventIndex = new SqliteEventIndex(path.join(dir, SQLITE_EVENT_INDEX_FILE), passphrase);
                    } catch (e) {
                        sendError(payload.id, <Error>e);
                        return;
                    }
                    break;
                }

                try {
                    const result = await initEventIndex(eventStorePath, passphrase, tokenizerMode, {
                        mkdir: afs.mkdir,
                        deleteContents,
                        createSeshat: (indexPath, config) => new Seshat(indexPath, config),
                        createSeshatRecovery: (indexPath, config) => new SeshatRecovery(indexPath, config),
                        isReindexError: (error) => error instanceof ReindexError,
                    });

                    eventIndex = result.eventIndex;
                    if (result.wasRecreated) {
                        // Tell element-web to force re-adding initial checkpoints.
                        ret = { wasRecreated: true };
                    }
                } catch (e) {
                    sendError(payload.id, <Error>e);
                    return;
                }
            }
            break;

        case "closeEventIndex":
            if (eventIndex !== null) {
                const index = eventIndex;
                eventIndex = null;

                try {
                    await index.shutdown();
                } catch (e) {
                    sendError(payload.id, <Error>e);
                    return;
                }
            }
            break;

        case "deleteEventIndex": {
            await deleteContents(eventStorePath);
            await deleteContents(getSqliteIndexDir());
            break;
        }

        case "isEventIndexEmpty":
            if (eventIndex === null) ret = true;
            else ret = await eventIndex.isEmpty();
            break;

        case "isRoomIndexed":
            if (eventIndex === null) ret = false;
            else ret = await eventIndex.isRoomIndexed(args[0]);
            break;

        case "addEventToIndex":
            try {
                eventIndex?.addEvent(args[0], args[1]);
            } catch (e) {
                sendError(payload.id, <Error>e);
                return;
            }
            break;

        case "deleteEvent":
            try {
                ret = await eventIndex?.deleteEvent(args[0]);
            } catch (e) {
                sendError(payload.id, <Error>e);
                return;
            }
            break;

        case "commitLiveEvents":
            try {
                ret = await eventIndex?.commit();
            } catch (e) {
                sendError(payload.id, <Error>e);
                return;
            }
            break;

        case "searchEventIndex":
            try {
                ret = await eventIndex?.search(args[0]);
            } catch (e) {
                sendError(payload.id, <Error>e);
                return;
            }
            break;

        case "addHistoricEvents":
            if (eventIndex === null) ret = false;
            else {
                try {
                    ret = await eventIndex.addHistoricEvents(args[0], args[1], args[2]);
                } catch (e) {
                    sendError(payload.id, <Error>e);
                    return;
                }
            }
            break;

        case "getStats":
            if (eventIndex === null) ret = 0;
            else {
                try {
                    ret = await eventIndex.getStats();
                } catch (e) {
                    sendError(payload.id, <Error>e);
                    return;
                }
            }
            break;

        case "removeCrawlerCheckpoint":
            if (eventIndex === null) ret = false;
            else {
                try {
                    ret = await eventIndex.removeCrawlerCheckpoint(args[0]);
                } catch (e) {
                    sendError(payload.id, <Error>e);
                    return;
                }
            }
            break;

        case "addCrawlerCheckpoint":
            if (eventIndex === null) ret = false;
            else {
                try {
                    ret = await eventIndex.addCrawlerCheckpoint(args[0]);
                } catch (e) {
                    sendError(payload.id, <Error>e);
                    return;
                }
            }
            break;

        case "loadFileEvents":
            if (eventIndex === null) ret = [];
            else {
                try {
                    ret = await eventIndex.loadFileEvents(args[0]);
                } catch (e) {
                    sendError(payload.id, <Error>e);
                    return;
                }
            }
            break;

        case "loadCheckpoints":
            if (eventIndex === null) ret = [];
            else {
                try {
                    ret = await eventIndex.loadCheckpoints();
                } catch {
                    ret = [];
                }
            }
            break;

        case "setUserVersion":
            if (eventIndex === null) break;
            else {
                try {
                    await eventIndex.setUserVersion(args[0]);
                } catch (e) {
                    sendError(payload.id, <Error>e);
                    return;
                }
            }
            break;

        case "getUserVersion":
            if (eventIndex === null) ret = 0;
            else {
                try {
                    ret = await eventIndex.getUserVersion();
                } catch (e) {
                    sendError(payload.id, <Error>e);
                    return;
                }
            }
            break;

        default:
            global.mainWindow?.webContents.send("seshatReply", {
                id: payload.id,
                error: "Unknown IPC Call: " + payload.name,
            });
            return;
    }

    global.mainWindow?.webContents.send("seshatReply", {
        id: payload.id,
        reply: ret,
    });
});
