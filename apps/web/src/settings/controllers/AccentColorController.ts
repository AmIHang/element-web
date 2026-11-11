/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import SettingController from "./SettingController";
import { type SettingLevel } from "../SettingLevel";
import { applyAccentColor } from "../enums/AccentColor";

/**
 * Applies the accent colour as soon as the setting changes, so the whole app recolours without a reload.
 */
export class AccentColorController extends SettingController {
    public onChange(level: SettingLevel, roomId: string | null, newValue: unknown): void {
        // A reset passes null; the device-level setting then falls back to the default colour
        applyAccentColor(newValue);
    }
}
