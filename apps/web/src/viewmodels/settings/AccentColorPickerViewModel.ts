/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import {
    BaseViewModel,
    type AccentColorPickerColor,
    type AccentColorPickerViewModel as AccentColorPickerViewModelInterface,
    type AccentColorPickerViewSnapshot,
} from "@element-hq/web-shared-components";

import SettingsStore from "../../settings/SettingsStore";
import { SettingLevel } from "../../settings/SettingLevel";
import { AccentColor, DEFAULT_ACCENT_COLOR, isAccentColor } from "../../settings/enums/AccentColor";

/** Read the accent colour setting, falling back to the default for a value that is not a known colour */
function getAccentColor(): AccentColor {
    const value = SettingsStore.getValue("accentColor");
    return isAccentColor(value) ? value : DEFAULT_ACCENT_COLOR;
}

/**
 * View model of the accent colour picker: shows the colour from the `accentColor` device setting and changes it.
 * The setting's controller recolours the app, so the change shows at once.
 */
export class AccentColorPickerViewModel
    extends BaseViewModel<AccentColorPickerViewSnapshot, Record<string, never>>
    implements AccentColorPickerViewModelInterface
{
    public constructor() {
        super({}, { colors: Object.values(AccentColor), selected: getAccentColor() });

        // Follow changes made elsewhere too, e.g. a second settings dialog
        const watcherRef = SettingsStore.watchSetting("accentColor", null, this.onSettingChanged);
        this.disposables.track(() => SettingsStore.unwatchSetting(watcherRef));
    }

    private onSettingChanged = (): void => {
        this.snapshot.merge({ selected: getAccentColor() });
    };

    public setColor = (color: AccentColorPickerColor): void => {
        if (!isAccentColor(color)) return;
        // Show the pick at once rather than after the setting has been written
        this.snapshot.merge({ selected: color });
        void SettingsStore.setValue("accentColor", null, SettingLevel.DEVICE, color);
    };
}
