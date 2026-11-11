/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";

import { AccentColor, applyAccentColor, DEFAULT_ACCENT_COLOR, isAccentColor } from "./AccentColor";

describe("AccentColor", () => {
    afterEach(() => {
        delete document.documentElement.dataset.accent;
    });

    it("recognises the accent colours", () => {
        expect(isAccentColor(AccentColor.Blue)).toBe(true);
        expect(isAccentColor("teal")).toBe(false);
        expect(isAccentColor(null)).toBe(false);
    });

    it("marks the root element with a picked colour", () => {
        applyAccentColor(AccentColor.Orange);
        expect(document.documentElement.dataset.accent).toBe("orange");
    });

    it("removes the mark for the default colour", () => {
        applyAccentColor(AccentColor.Orange);
        applyAccentColor(DEFAULT_ACCENT_COLOR);
        expect(document.documentElement.dataset.accent).toBeUndefined();
    });

    it.each([null, undefined, "teal"])("falls back to the default colour for %s", (value) => {
        applyAccentColor(AccentColor.Cyan);
        applyAccentColor(value);
        expect(document.documentElement.dataset.accent).toBeUndefined();
    });
});
