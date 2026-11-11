/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { EventEmitter } from "node:events";
import { expect, describe, it, beforeEach, afterEach, vi } from "vitest";

import {
    ClaudeSignInError,
    findAnthropicCli,
    getClaudeAccount,
    getClaudeAccountConfig,
    runClaudeSignIn,
} from "./claude-account.js";

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn }));

/** A stand-in for the process of `ant auth login` */
class FakeProcess extends EventEmitter {
    public exitCode: number | null = null;
    public stderr = new EventEmitter();
    public kill = vi.fn(() => true);
    public exit(code: number): void {
        this.exitCode = code;
        this.emit("exit", code);
    }
}

let configDir: string;

/** Write a profile as `ant auth login` does */
async function writeProfile(name: string, type: string, credentials?: object): Promise<void> {
    await fs.mkdir(path.join(configDir, "configs"), { recursive: true });
    await fs.writeFile(
        path.join(configDir, "configs", `${name}.json`),
        JSON.stringify({ authentication: { type, client_id: "test" } }),
    );
    if (credentials) {
        await fs.mkdir(path.join(configDir, "credentials"), { recursive: true });
        await fs.writeFile(
            path.join(configDir, "credentials", `${name}.json`),
            JSON.stringify({ type: "oauth_token", ...credentials }),
        );
    }
}

describe("claude-account", () => {
    beforeEach(async () => {
        configDir = await fs.mkdtemp(path.join(os.tmpdir(), "anthropic-"));
        vi.stubEnv("ANTHROPIC_CONFIG_DIR", configDir);
        vi.stubEnv("ANTHROPIC_PROFILE", "");
        vi.stubEnv("ANTHROPIC_FEDERATION_RULE_ID", "");
    });

    afterEach(async () => {
        vi.unstubAllEnvs();
        await fs.rm(configDir, { recursive: true, force: true });
    });

    describe("getClaudeAccount", () => {
        it("is not signed in without a profile", async () => {
            expect(await getClaudeAccountConfig()).toBeUndefined();
            expect(await getClaudeAccount()).toEqual({ signedIn: false });
        });

        it("reads the account of the active profile, with where its tokens are", async () => {
            await writeProfile("work", "user_oauth", {
                access_token: "token",
                account_email: "alice@example.org",
                organization_name: "Example",
            });
            await fs.writeFile(path.join(configDir, "active_config"), "work\n");

            expect(await getClaudeAccount()).toEqual({
                signedIn: true,
                email: "alice@example.org",
                organization: "Example",
            });
            expect((await getClaudeAccountConfig())?.authentication.credentials_path).toBe(
                path.join(configDir, "credentials", "work.json"),
            );
        });

        it("is not signed in with a profile that has no tokens, or is not for a person", async () => {
            await writeProfile("default", "user_oauth");
            expect(await getClaudeAccount()).toEqual({ signedIn: false });

            vi.stubEnv("ANTHROPIC_FEDERATION_RULE_ID", "");
            await writeProfile("default", "oidc_federation", { access_token: "token" });
            expect(await getClaudeAccount()).toEqual({ signedIn: false });
        });
    });

    describe("findAnthropicCli", () => {
        it("finds ant.exe in a folder of the PATH on Windows", async () => {
            const bin = path.join(configDir, "bin");
            await fs.mkdir(bin);
            await fs.writeFile(path.join(bin, "ant.exe"), "");

            expect(
                await findAnthropicCli({ Path: [path.join(configDir, "none"), bin].join(path.delimiter) }, "win32"),
            ).toBe(path.join(bin, "ant.exe"));
        });

        it("looks in the folder of go install", async () => {
            const bin = path.join(configDir, "go", "bin");
            await fs.mkdir(bin, { recursive: true });
            await fs.writeFile(path.join(bin, "ant"), "");

            expect(await findAnthropicCli({ HOME: configDir }, "linux")).toBe(path.join(bin, "ant"));
            expect(await findAnthropicCli({}, "linux")).toBeUndefined();
        });
    });

    describe("runClaudeSignIn", () => {
        let child: FakeProcess;
        let cli: string;

        beforeEach(async () => {
            child = new FakeProcess();
            spawn.mockReset().mockReturnValue(child);
            const bin = path.join(configDir, "bin");
            await fs.mkdir(bin);
            cli = path.join(bin, process.platform === "win32" ? "ant.exe" : "ant");
            await fs.writeFile(cli, "");
            vi.stubEnv("PATH", bin);
        });

        it("runs ant auth login without a window until it exits", async () => {
            const result = runClaudeSignIn(new Promise(() => {}));
            await vi.waitFor(() => expect(spawn).toHaveBeenCalled());
            child.exit(0);

            await expect(result).resolves.toBeUndefined();
            expect(spawn).toHaveBeenCalledWith(cli, ["auth", "login"], expect.objectContaining({ windowsHide: true }));
            expect(child.kill).not.toHaveBeenCalled();
        });

        it("reports what the CLI wrote when it fails", async () => {
            const result = runClaudeSignIn(new Promise(() => {}));
            await vi.waitFor(() => expect(spawn).toHaveBeenCalled());
            child.stderr.emit("data", Buffer.from("access denied\n"));
            child.exit(1);

            await expect(result).rejects.toMatchObject({ reason: "failed", message: "access denied" });
        });

        it("ends the CLI when the sign-in is stopped", async () => {
            let stop!: (e: Error) => void;
            const stopped = new Promise<never>((_, reject) => (stop = reject));
            const result = runClaudeSignIn(stopped);
            await vi.waitFor(() => expect(spawn).toHaveBeenCalled());
            stop(new Error("cancelled"));

            await expect(result).rejects.toThrow("cancelled");
            expect(child.kill).toHaveBeenCalled();
        });

        it("reports a missing Anthropic CLI", async () => {
            vi.stubEnv("PATH", "");
            vi.stubEnv("Path", "");
            vi.stubEnv("HOME", configDir);
            vi.stubEnv("USERPROFILE", configDir);

            const error = await runClaudeSignIn(new Promise(() => {})).catch((e) => e);
            expect(error).toBeInstanceOf(ClaudeSignInError);
            expect(error.reason).toBe("missing_cli");
        });
    });
});
