#!/usr/bin/env node
/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/*
 * Starts an Element Pilot release: sets the new version in pilot/build.json, commits it and tags the commit
 * `pilot/v<version>`. Pushing the tag builds the release.
 *
 *     pnpm release:pilot <major|minor|patch|1.2.3|1.2.3-beta.1>
 */

import { promises as fs } from "node:fs";
import * as childProcess from "node:child_process";
import * as url from "node:url";

import { bumpVersion, readPilotVersion, TAG_PREFIX, VARIANT_FILE } from "./pilot-version.ts";

function git(...args: string[]): void {
    childProcess.execFileSync("git", args, { stdio: "inherit" });
}

async function main(args: string[]): Promise<number> {
    const bump = args[0];
    if (!bump) {
        console.error("Usage: pnpm release:pilot <major|minor|patch|1.2.3|1.2.3-beta.1>");
        return 1;
    }

    const current = await readPilotVersion();
    const version = bumpVersion(current, bump);
    const tag = `${TAG_PREFIX}${version}`;

    // Replace only the version, so the rest of the file keeps its formatting
    const variant = await fs.readFile(VARIANT_FILE, "utf8");
    await fs.writeFile(VARIANT_FILE, variant.replace(/("version":\s*)"[^"]*"/, `$1"${version}"`));

    // Commit only the variant file, so other changes in the working tree stay out of the release commit
    git("commit", "-m", `Release Element Pilot ${version}`, "--", VARIANT_FILE);
    git("tag", "-a", tag, "-m", `Element Pilot ${version}`);

    console.log(`Element Pilot ${current} -> ${version}, tagged ${tag}. Build the release by pushing it:`);
    console.log(`    git push origin HEAD ${tag}`);
    return 0;
}

if (import.meta.url.startsWith("file:")) {
    const modulePath = url.fileURLToPath(import.meta.url);
    if (process.argv[1] === modulePath) {
        main(process.argv.slice(2))
            .then((ret) => {
                process.exit(ret);
            })
            .catch((e) => {
                console.error(e);
                process.exit(1);
            });
    }
}
