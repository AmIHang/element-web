/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX } from "react";
import { AccentColorPickerView, useCreateAutoDisposedViewModel } from "@element-hq/web-shared-components";

import { _t } from "../../../languageHandler";
import { SettingsSubsection } from "./shared/SettingsSubsection";
import { AccentColorPickerViewModel } from "../../../viewmodels/settings/AccentColorPickerViewModel";

/**
 * The accent colour section of the appearance settings.
 */
export function AccentColorPanel(): JSX.Element {
    const vm = useCreateAutoDisposedViewModel(() => new AccentColorPickerViewModel());
    return (
        <SettingsSubsection heading={_t("settings|appearance|accent_color")} legacy={false}>
            <AccentColorPickerView vm={vm} />
        </SettingsSubsection>
    );
}
