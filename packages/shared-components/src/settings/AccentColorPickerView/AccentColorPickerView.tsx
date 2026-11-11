/*
 * Copyright 2026 Element Creations Ltd.
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE files in the repository root for full details.
 */

import React, { type JSX } from "react";
import classNames from "classnames";

import { useViewModel, type ViewModel } from "../../core/viewmodel";
import { useI18n } from "../../core/i18n/i18nContext";
import { Flex } from "../../core/utils/Flex";
import styles from "./AccentColorPickerView.module.css";

/**
 * The accent colours to pick from. Each names the Compound palette the swatch shows.
 */
export type AccentColorPickerColor = "purple" | "blue" | "cyan" | "green" | "orange" | "pink";

export interface AccentColorPickerViewSnapshot {
    /** The colours offered, in the order they are shown */
    colors: AccentColorPickerColor[];
    /** The colour the app is shown in */
    selected: AccentColorPickerColor;
}

export interface AccentColorPickerViewActions {
    /** Show the app in the given colour */
    setColor: (color: AccentColorPickerColor) => void;
}

export type AccentColorPickerViewModel = ViewModel<AccentColorPickerViewSnapshot, AccentColorPickerViewActions>;

export interface AccentColorPickerViewProps {
    /** The view model of the picker */
    vm: AccentColorPickerViewModel;
}

/**
 * A row of colour swatches to pick the accent colour of the app, one radio button each.
 */
export function AccentColorPickerView({ vm }: Readonly<AccentColorPickerViewProps>): JSX.Element {
    const { translate: _t } = useI18n();
    const { colors, selected } = useViewModel(vm);

    const names: Record<AccentColorPickerColor, string> = {
        purple: _t("settings|accent_color|purple"),
        blue: _t("settings|accent_color|blue"),
        cyan: _t("settings|accent_color|cyan"),
        green: _t("settings|accent_color|green"),
        orange: _t("settings|accent_color|orange"),
        pink: _t("settings|accent_color|pink"),
    };

    return (
        <Flex
            role="radiogroup"
            aria-label={_t("settings|accent_color|label")}
            gap="var(--cpd-space-3x)"
            wrap="wrap"
            className={styles.picker}
        >
            {colors.map((color) => (
                <label key={color} className={styles.option} title={names[color]}>
                    <input
                        type="radio"
                        name="accentColor"
                        value={color}
                        checked={selected === color}
                        onChange={() => vm.setColor(color)}
                        aria-label={names[color]}
                        className={styles.input}
                    />
                    <span className={classNames(styles.swatch, styles[color])} aria-hidden="true" />
                </label>
            ))}
        </Flex>
    );
}
