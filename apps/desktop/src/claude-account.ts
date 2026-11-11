/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// Instead of an API key, Claude can use the Anthropic account the Anthropic CLI (`ant`) is signed in to on this
// computer. The CLI keeps that sign-in as a profile in its own folder, which the Anthropic SDK reads and refreshes
// itself, so Element stores no credential for it. Signing in runs `ant auth login`, which signs in in the browser.

import path from "node:path";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import {
    type AnthropicConfig,
    getCredentialsPath,
    loadConfig,
    loadCredentials,
} from "@anthropic-ai/sdk/core/credentials";
import type { ClaudeAccount } from "shared-types";

/**
 * Read the profile the Anthropic CLI is signed in with on this computer: the one `ANTHROPIC_PROFILE` or the CLI's
 * active profile names.
 * @returns the profile's settings, with where its tokens are, or undefined if it is not signed in to an account
 */
export async function getClaudeAccountConfig(): Promise<AnthropicConfig | undefined> {
    const config = await loadConfig();
    // Other kinds of profiles, such as workload identity federation, are for servers rather than for a person
    if (config?.authentication.type !== "user_oauth") return undefined;
    const credentialsPath = config.authentication.credentials_path ?? (await getCredentialsPath(config));
    if (!credentialsPath) return undefined;
    return { ...config, authentication: { ...config.authentication, credentials_path: credentialsPath } };
}

/**
 * Get the Anthropic account the Anthropic CLI is signed in to on this computer.
 */
export async function getClaudeAccount(): Promise<ClaudeAccount> {
    const cliInstalled = (await findAnthropicCli()) !== undefined;
    const config = await getClaudeAccountConfig();
    if (!config) return { signedIn: false, cliInstalled };
    const credentials = await loadCredentials();
    if (!credentials?.access_token) return { signedIn: false, cliInstalled };
    return {
        signedIn: true,
        email: credentials.account_email || undefined,
        organization: credentials.organization_name || undefined,
        workspace: config.workspace_id || undefined,
        cliInstalled,
    };
}

/**
 * Find the Anthropic CLI in the folders of the PATH, and in the folder `go install` puts it in.
 * @returns the path of the executable, or undefined if it is not installed
 */
export async function findAnthropicCli(
    env: NodeJS.ProcessEnv = process.env,
    platform: NodeJS.Platform = process.platform,
): Promise<string | undefined> {
    const names = platform === "win32" ? ["ant.exe"] : ["ant"];
    const folders = (env.PATH ?? env.Path ?? "").split(path.delimiter).filter(Boolean);
    const home = platform === "win32" ? env.USERPROFILE : env.HOME;
    if (home) folders.push(path.join(home, "go", "bin"));
    for (const folder of folders) {
        for (const name of names) {
            const candidate = path.join(folder, name);
            try {
                if ((await fs.stat(candidate)).isFile()) return candidate;
            } catch {
                // Not in this folder
            }
        }
    }
    return undefined;
}

/** Why `ant auth login` didn't sign in */
export class ClaudeSignInError extends Error {
    public constructor(
        public readonly reason: "missing_cli" | "failed",
        message: string,
    ) {
        super(message);
    }
}

/**
 * Sign in to an Anthropic account in the browser with `ant auth login`, which stores the sign-in as the CLI's
 * active profile.
 * @param stopped - Rejects when the sign-in is cancelled or times out; the CLI is then ended
 * @throws {ClaudeSignInError} if the CLI is missing or fails, or the rejection of `stopped`
 */
export async function runClaudeSignIn(stopped: Promise<never>): Promise<void> {
    const cli = await findAnthropicCli();
    if (!cli) throw new ClaudeSignInError("missing_cli", "The Anthropic CLI (ant) is not installed");

    const child = spawn(cli, ["auth", "login"], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
    let errorOutput = "";
    const onErrorOutput = (chunk: Buffer): void => {
        // Only the end is kept, for the message of a failure
        errorOutput = (errorOutput + chunk.toString()).slice(-2000);
    };
    child.stderr?.on("data", onErrorOutput);
    const exited = new Promise<void>((resolve, reject) => {
        child.once("error", (e) => reject(new ClaudeSignInError("failed", e.message)));
        child.once("exit", (code) => {
            if (code === 0) resolve();
            else reject(new ClaudeSignInError("failed", errorOutput.trim() || `ant auth login exited with ${code}`));
        });
    });
    try {
        // Waits until the user has signed in in the browser
        await Promise.race([exited, stopped]);
    } finally {
        child.stderr?.off("data", onErrorOutput);
        if (child.exitCode === null) child.kill();
    }
}
