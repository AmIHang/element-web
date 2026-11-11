/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// Element Pilot has no update server, so it can't update itself like Element does. Instead this checks its GitHub
// releases for a newer version and tells the renderer, which offers the release page to download the installer.

import { app } from "electron";

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const INITIAL_CHECK_DELAY_MS = 30 * 1000;

/** Releases of Element Pilot are tagged pilot/v<version>; other releases of the repository are not for this app. */
const TAG_PREFIX = "pilot/v";

/** The fields of a release in the GitHub API that the check needs. */
export interface GitHubRelease {
    tag_name: string;
    html_url: string;
    draft: boolean;
    prerelease: boolean;
}

/** A release that is newer than the running app. */
export interface NewRelease {
    /** The version, such as 1.2.0 */
    version: string;
    /** The release page, where the installers can be downloaded */
    url: string;
}

interface ParsedVersion {
    numbers: [number, number, number];
    preRelease: (string | number)[];
}

function parseVersion(version: string): ParsedVersion | null {
    const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(version);
    if (!match) return null;
    return {
        numbers: [Number(match[1]), Number(match[2]), Number(match[3])],
        preRelease: match[4] ? match[4].split(".").map((part) => (/^\d+$/.test(part) ? Number(part) : part)) : [],
    };
}

/**
 * Compares two versions major.minor.patch with an optional pre-release label, such as 1.2.0-beta.1, in the order
 * semantic versioning gives them: a pre-release comes before its release.
 * @returns a negative number if a is older than b, a positive number if it is newer, or 0 if they are the same
 *     version or either can't be read.
 */
export function compareVersions(a: string, b: string): number {
    const va = parseVersion(a);
    const vb = parseVersion(b);
    if (!va || !vb) return 0;

    for (let i = 0; i < 3; i++) {
        if (va.numbers[i] !== vb.numbers[i]) return va.numbers[i] - vb.numbers[i];
    }

    if (!va.preRelease.length || !vb.preRelease.length) return vb.preRelease.length - va.preRelease.length;
    for (let i = 0; i < Math.min(va.preRelease.length, vb.preRelease.length); i++) {
        const pa = va.preRelease[i];
        const pb = vb.preRelease[i];
        if (pa === pb) continue;
        if (typeof pa === "number" && typeof pb === "number") return pa - pb;
        // Numbers come before labels
        if (typeof pa === "number") return -1;
        if (typeof pb === "number") return 1;
        return pa < pb ? -1 : 1;
    }
    return va.preRelease.length - vb.preRelease.length;
}

/**
 * Finds the newest release that is newer than the running version. Pre-releases only count when the running version
 * is one itself, so that people on a stable version are only offered stable versions.
 * @param releases the releases as the GitHub API lists them
 * @param currentVersion the version of the running app
 */
export function findNewerRelease(releases: GitHubRelease[], currentVersion: string): NewRelease | null {
    const acceptPreReleases = currentVersion.includes("-");
    let newest: NewRelease | null = null;
    for (const release of releases) {
        if (release.draft || (release.prerelease && !acceptPreReleases)) continue;
        if (!release.tag_name.startsWith(TAG_PREFIX) || !release.html_url.startsWith("https://")) continue;
        const version = release.tag_name.slice(TAG_PREFIX.length);
        if (!parseVersion(version) || compareVersions(version, currentVersion) <= 0) continue;
        if (!newest || compareVersions(version, newest.version) > 0) {
            newest = { version, url: release.html_url };
        }
    }
    return newest;
}

/**
 * Fetches the releases and tells the main window if there is a newer one. Errors are only logged, as the check is
 * repeated later.
 * @param releasesUrl the GitHub API URL listing the releases
 */
export async function checkForNewRelease(releasesUrl: string): Promise<NewRelease | null> {
    try {
        const response = await fetch(releasesUrl, { headers: { Accept: "application/vnd.github+json" } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const release = findNewerRelease((await response.json()) as GitHubRelease[], app.getVersion());
        if (release) {
            console.log(`Release check: version ${release.version} is available at ${release.url}`);
            global.mainWindow?.webContents.send("new-release-available", release);
        } else {
            console.log(`Release check: ${app.getVersion()} is the latest version`);
        }
        return release;
    } catch (e) {
        console.warn(`Release check: couldn't fetch the releases from ${releasesUrl}`, e);
        return null;
    }
}

/**
 * Checks for a newer release shortly after the start, once the main window has loaded, and every few hours after that.
 * @param releasesUrl the GitHub API URL listing the releases
 */
export function start(releasesUrl: string): void {
    console.log(`Starting the release check with ${releasesUrl}`);
    // The delay gives the main window time to load. initialisePromise from ipc.ts can't be used for that: the preload
    // emits "initialise" only in the renderer, so the promise never resolves in the main process.
    setTimeout(() => void checkForNewRelease(releasesUrl), INITIAL_CHECK_DELAY_MS);
    setInterval(() => void checkForNewRelease(releasesUrl), CHECK_INTERVAL_MS);
}
