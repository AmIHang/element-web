/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// @vitest-environment happy-dom

import { describe, it, expect, afterEach, vi } from "vitest";

import { AccentColorPickerViewModel } from "./AccentColorPickerViewModel";
import SettingsStore from "../../settings/SettingsStore";
import { SettingLevel } from "../../settings/SettingLevel";
import { AccentColor } from "../../settings/enums/AccentColor";

describe("AccentColorPickerViewModel", () => {
    let vm: AccentColorPickerViewModel | undefined;

    afterEach(async () => {
        vm?.dispose();
        vm = undefined;
        await SettingsStore.setValue("accentColor", null, SettingLevel.DEVICE, null);
    });

    it("offers every accent colour and selects the default", () => {
        vm = new AccentColorPickerViewModel();
        expect(vm.getSnapshot()).toEqual({ colors: Object.values(AccentColor), selected: AccentColor.Purple });
    });

    it("selects the colour from the setting", async () => {
        await SettingsStore.setValue("accentColor", null, SettingLevel.DEVICE, AccentColor.Cyan);
        vm = new AccentColorPickerViewModel();
        expect(vm.getSnapshot().selected).toBe(AccentColor.Cyan);
    });

    it("saves the picked colour and recolours the app", async () => {
        vm = new AccentColorPickerViewModel();
        vm.setColor("orange");
        // The pick shows at once; the setting is written asynchronously
        expect(vm.getSnapshot().selected).toBe(AccentColor.Orange);
        await vi.waitFor(() => expect(SettingsStore.getValue("accentColor")).toBe(AccentColor.Orange));
        expect(document.documentElement.dataset.accent).toBe("orange");
        expect(vm.getSnapshot().selected).toBe(AccentColor.Orange);
    });

    it("follows changes made elsewhere", async () => {
        vm = new AccentColorPickerViewModel();
        await SettingsStore.setValue("accentColor", null, SettingLevel.DEVICE, AccentColor.Pink);
        expect(vm.getSnapshot().selected).toBe(AccentColor.Pink);
    });
});
