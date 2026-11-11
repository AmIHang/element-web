#!/usr/bin/env node
/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/*
 * Element Pilot is released under its own version, kept in pilot/build.json, apart from the Element version in
 * package.json. Run without arguments, this prints the version a CI build gets: the release version for a
 * `pilot/v<version>` tag, otherwise a development version after it.
 */

import { promises as fs } from "node:fs";
import * as url from "node:url";

/** Prefix of the git tags that release Element Pilot, so they don't mix with Element's `v<version>` tags. */
export const TAG_PREFIX = "pilot/v";

/** The variant file holding the Element Pilot version. */
export const VARIANT_FILE = "pilot/build.json";

/** How to change the version: a part to increase, or the new version itself. */
export type VersionBump = "major" | "minor" | "patch" | string;

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

/**
 * Splits a version into its numbers and pre-release label.
 * @param version - a version like `1.2.3` or `1.2.3-beta.1`.
 * @throws if the version is not in that form.
 */
export function parseVersion(version: string): { major: number; minor: number; patch: number; pre?: string } {
    const match = VERSION_PATTERN.exec(version);
    if (!match) throw new Error(`'${version}' is not a version like 1.2.3 or 1.2.3-beta.1`);
    return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), pre: match[4] };
}

/**
 * Returns the version after `current`.
 * @param current - the current version.
 * @param bump - `major`, `minor` or `patch` to increase that part, or the new version.
 * @throws if the new version is not a valid version.
 */
export function bumpVersion(current: string, bump: VersionBump): string {
    const { major, minor, patch, pre } = parseVersion(current);
    switch (bump) {
        case "major":
            return `${major + 1}.0.0`;
        case "minor":
            return `${major}.${minor + 1}.0`;
        case "patch":
            // A pre-release of a patch is released as that patch
            return pre ? `${major}.${minor}.${patch}` : `${major}.${minor}.${patch + 1}`;
        default:
            parseVersion(bump);
            return bump;
    }
}

/**
 * Returns the version a CI build of Element Pilot gets.
 * @param version - the version in pilot/build.json.
 * @param ref - the git ref being built, e.g. `refs/tags/pilot/v1.2.3` or `refs/heads/develop`.
 * @param runNumber - the number of the CI run, which tells development builds apart.
 * @throws if a release tag doesn't match the version in pilot/build.json.
 */
export function buildVersion(version: string, ref: string, runNumber: string): string {
    const tagPrefix = `refs/tags/${TAG_PREFIX}`;
    if (ref.startsWith(tagPrefix)) {
        const tagged = ref.slice(tagPrefix.length);
        if (tagged !== version) {
            throw new Error(`Tag ${TAG_PREFIX}${tagged} doesn't match version ${version} in ${VARIANT_FILE}`);
        }
        return version;
    }
    // Development builds come after the last release, so they sort above it
    return `${bumpVersion(version, "patch")}-dev.${runNumber}`;
}

/** Reads the Element Pilot version from pilot/build.json. */
export async function readPilotVersion(): Promise<string> {
    const variant = JSON.parse(await fs.readFile(VARIANT_FILE, "utf8"));
    return variant.version;
}

async function main(): Promise<number> {
    const version = await readPilotVersion();
    console.log(buildVersion(version, process.env.GITHUB_REF ?? "", process.env.GITHUB_RUN_NUMBER ?? "0"));
    return 0;
}

if (import.meta.url.startsWith("file:")) {
    const modulePath = url.fileURLToPath(import.meta.url);
    if (process.argv[1] === modulePath) {
        main()
            .then((ret) => {
                process.exit(ret);
            })
            .catch((e) => {
                console.error(e);
                process.exit(1);
            });
    }
}
