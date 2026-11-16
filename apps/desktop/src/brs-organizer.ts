/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// Adds todos to BRSOrganizer, a task list that runs as a local daemon on this computer. The daemon listens on
// 127.0.0.1 and wants the access token it keeps in the system's credential store.

import path from "node:path";
import fs from "node:fs/promises";
import { createRequire } from "node:module";

const APP_NAME = "BRSOrganizer";
const DEFAULT_PORT = 47821;

/** A todo for BRSOrganizer */
export interface BrsOrganizerTodo {
    title: string;
    notes?: string;
    /** The BSM ticket: its key, such as BRS_PWg0127, or its link */
    bsmUrl?: string;
    /** The OTMA ticket: its number, such as 148082, or its link */
    otmaUrl?: string;
}

/** The data folder of BRSOrganizer, where it also is installed */
function getDataPath(): string | undefined {
    return process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, APP_NAME) : undefined;
}

/** The port the daemon announced in its data folder */
async function getPort(dataPath: string): Promise<number> {
    try {
        const { port } = JSON.parse(await fs.readFile(path.join(dataPath, "daemon.json"), "utf8"));
        return typeof port === "number" ? port : DEFAULT_PORT;
    } catch {
        return DEFAULT_PORT;
    }
}

/**
 * Read the access token of the daemon from the credential store.
 * shortcut: uses the keyring module BRSOrganizer installs with itself rather than a dependency of our own; add
 * `@napi-rs/keyring` to Element Desktop if BRSOrganizer stops shipping it.
 */
function getToken(dataPath: string): string | undefined {
    try {
        const require = createRequire(path.join(dataPath, "runtime", "daemon.mjs"));
        const { Entry } = require("@napi-rs/keyring");
        return new Entry(APP_NAME, "local-access-token").getPassword() ?? undefined;
    } catch {
        return undefined;
    }
}

/** Whether BRSOrganizer is installed on this computer with an access token */
export function hasBrsOrganizer(): boolean {
    const dataPath = getDataPath();
    return Boolean(dataPath && getToken(dataPath));
}

/**
 * Add an open todo to BRSOrganizer.
 * @returns whether it was added; false if BRSOrganizer is not installed or its daemon doesn't run
 */
export async function addBrsOrganizerTodo(todo: BrsOrganizerTodo): Promise<boolean> {
    const dataPath = getDataPath();
    const token = dataPath && getToken(dataPath);
    if (!dataPath || !token) return false;
    try {
        const response = await fetch(`http://127.0.0.1:${await getPort(dataPath)}/api/todos`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
            // BRSOrganizer turns a BSM key or OTMA number into the ticket's link itself
            body: JSON.stringify({
                title: todo.title,
                notes: todo.notes || null,
                bsmUrl: todo.bsmUrl ?? null,
                otmaUrl: todo.otmaUrl ?? null,
            }),
        });
        if (!response.ok) console.warn(`BRSOrganizer did not add the todo: ${response.status}`);
        return response.ok;
    } catch (e) {
        console.warn("BRSOrganizer is not reachable", e);
        return false;
    }
}
