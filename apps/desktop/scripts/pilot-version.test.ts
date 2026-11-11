/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import { buildVersion, bumpVersion, parseVersion } from "./pilot-version.ts";

describe("parseVersion", () => {
    it("reads a release and a pre-release version", () => {
        expect(parseVersion("1.2.3")).toEqual({ major: 1, minor: 2, patch: 3, pre: undefined });
        expect(parseVersion("1.2.3-beta.1")).toEqual({ major: 1, minor: 2, patch: 3, pre: "beta.1" });
    });

    it.each(["1.2", "v1.2.3", "1.2.3+element.1", "1.2.3-", ""])("rejects '%s'", (version) => {
        expect(() => parseVersion(version)).toThrow(/is not a version/);
    });
});

describe("bumpVersion", () => {
    it.each([
        ["1.2.3", "major", "2.0.0"],
        ["1.2.3", "minor", "1.3.0"],
        ["1.2.3", "patch", "1.2.4"],
        ["1.3.0-beta.2", "patch", "1.3.0"],
        ["1.2.3", "1.3.0-beta.1", "1.3.0-beta.1"],
    ])("bumps %s by %s to %s", (current, bump, expected) => {
        expect(bumpVersion(current, bump)).toBe(expected);
    });

    it("rejects a new version that isn't one", () => {
        expect(() => bumpVersion("1.2.3", "next")).toThrow(/is not a version/);
    });
});

describe("buildVersion", () => {
    it("uses the version for its release tag", () => {
        expect(buildVersion("1.2.3", "refs/tags/pilot/v1.2.3", "7")).toBe("1.2.3");
    });

    it("rejects a release tag that doesn't match the version", () => {
        expect(() => buildVersion("1.2.3", "refs/tags/pilot/v1.2.4", "7")).toThrow(/doesn't match/);
    });

    it("gives other builds a development version after the release", () => {
        expect(buildVersion("1.2.3", "refs/heads/develop", "42")).toBe("1.2.4-dev.42");
        expect(buildVersion("1.2.3", "refs/tags/v1.12.33", "42")).toBe("1.2.4-dev.42");
    });
});
