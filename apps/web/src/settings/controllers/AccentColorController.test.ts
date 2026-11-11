/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";

import { AccentColorController } from "./AccentColorController";
import { SettingLevel } from "../SettingLevel";
import { AccentColor } from "../enums/AccentColor";
import SettingsStore from "../SettingsStore";

describe("AccentColorController", () => {
    afterEach(async () => {
        await SettingsStore.setValue("accentColor", null, SettingLevel.DEVICE, null);
        delete document.documentElement.dataset.accent;
    });

    it("applies the new colour", () => {
        new AccentColorController().onChange(SettingLevel.DEVICE, null, AccentColor.Pink);
        expect(document.documentElement.dataset.accent).toBe("pink");
    });

    it("applies the colour when the setting is changed", async () => {
        await SettingsStore.setValue("accentColor", null, SettingLevel.DEVICE, AccentColor.Green);
        expect(document.documentElement.dataset.accent).toBe("green");
    });
});
