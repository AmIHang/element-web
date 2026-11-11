/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { checkForNewRelease, compareVersions, findNewerRelease, start, type GitHubRelease } from "./release-check.js";

vi.mock("electron", () => ({
    app: { getVersion: vi.fn(() => "1.1.0") },
}));

function release(version: string, extra: Partial<GitHubRelease> = {}): GitHubRelease {
    return {
        tag_name: `pilot/v${version}`,
        html_url: `https://github.com/owner/repo/releases/tag/pilot/v${version}`,
        draft: false,
        prerelease: version.includes("-"),
        ...extra,
    };
}

describe("compareVersions", () => {
    it.each([
        ["1.1.0", "1.0.9"],
        ["2.0.0", "1.10.10"],
        ["1.10.0", "1.9.0"],
        ["1.2.0", "1.2.0-beta.3"],
        ["1.2.0-beta.10", "1.2.0-beta.2"],
        ["1.2.0-beta.1", "1.2.0-beta"],
        ["1.2.0-beta.1", "1.2.0-alpha.5"],
        ["1.2.0-beta", "1.2.0-1"],
        ["1.1.1", "1.1.1-dev.42"],
    ])("orders %s after %s", (newer, older) => {
        expect(compareVersions(newer, older)).toBeGreaterThan(0);
        expect(compareVersions(older, newer)).toBeLessThan(0);
    });

    it("treats equal and unreadable versions as the same", () => {
        expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
        expect(compareVersions("1.2.3-beta.1", "1.2.3-beta.1")).toBe(0);
        expect(compareVersions("nonsense", "1.2.3")).toBe(0);
    });
});

describe("findNewerRelease", () => {
    it("returns the newest release newer than the running version", () => {
        expect(findNewerRelease([release("1.0.0"), release("1.3.0"), release("1.2.0")], "1.1.0")).toEqual({
            version: "1.3.0",
            url: "https://github.com/owner/repo/releases/tag/pilot/v1.3.0",
        });
    });

    it("returns null when the running version is the latest", () => {
        expect(findNewerRelease([release("1.1.0"), release("1.0.0")], "1.1.0")).toBeNull();
        expect(findNewerRelease([], "1.1.0")).toBeNull();
    });

    it("only offers pre-releases to pre-release versions", () => {
        const releases = [release("1.1.0"), release("1.2.0-beta.1")];
        expect(findNewerRelease(releases, "1.1.0")).toBeNull();
        expect(findNewerRelease(releases, "1.1.1-dev.3")?.version).toBe("1.2.0-beta.1");
    });

    it("ignores drafts, other tags and release pages that aren't https", () => {
        const releases = [
            release("1.5.0", { draft: true }),
            release("1.4.0", { tag_name: "v1.4.0" }),
            release("1.3.0", { html_url: "javascript:alert(1)" }),
            release("1.2.0", { tag_name: "pilot/vnext" }),
        ];
        expect(findNewerRelease(releases, "1.1.0")).toBeNull();
    });
});

describe("checkForNewRelease", () => {
    const send = vi.fn();

    beforeEach(() => {
        global.mainWindow = { webContents: { send } } as unknown as Electron.BrowserWindow;
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        send.mockReset();
        global.mainWindow = null;
    });

    it("tells the main window about a newer release", async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([release("1.2.0")])));
        vi.stubGlobal("fetch", fetchMock);

        const result = await checkForNewRelease("https://api.github.com/repos/owner/repo/releases");

        expect(fetchMock).toHaveBeenCalledWith("https://api.github.com/repos/owner/repo/releases", expect.anything());
        expect(result?.version).toBe("1.2.0");
        expect(send).toHaveBeenCalledWith("new-release-available", result);
    });

    it("tells the main window nothing when there is no newer release", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([release("1.1.0")]))));

        expect(await checkForNewRelease("https://example.org/releases")).toBeNull();
        expect(send).not.toHaveBeenCalled();
    });

    it("checks shortly after the start and then every few hours", async () => {
        vi.useFakeTimers();
        const fetchMock = vi.fn().mockResolvedValue(new Response("[]"));
        vi.stubGlobal("fetch", fetchMock);

        start("https://example.org/releases");
        expect(fetchMock).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(30 * 1000);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);
        expect(fetchMock).toHaveBeenCalledTimes(2);

        vi.clearAllTimers();
        vi.useRealTimers();
    });

    it("returns null when the releases can't be fetched", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("rate limited", { status: 403 })));
        expect(await checkForNewRelease("https://example.org/releases")).toBeNull();

        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
        expect(await checkForNewRelease("https://example.org/releases")).toBeNull();
        expect(send).not.toHaveBeenCalled();
    });
});
