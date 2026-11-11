/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

/**
 * The accent colours the user can pick in the appearance settings.
 * Each value names the Compound palette that `res/css/accent.pcss` maps the accent scale to.
 */
export enum AccentColor {
    Purple = "purple",
    Blue = "blue",
    Cyan = "cyan",
    Green = "green",
    Orange = "orange",
    Pink = "pink",
}

/** The accent colour of the app icon, used when the user has not picked one */
export const DEFAULT_ACCENT_COLOR = AccentColor.Purple;

/** Whether the value is one of the accent colours, e.g. for a value read from storage */
export function isAccentColor(value: unknown): value is AccentColor {
    return Object.values<unknown>(AccentColor).includes(value);
}

/**
 * Show the app in the given accent colour, without reloading.
 * Unknown values fall back to the default, so that a stale or hand-edited setting cannot leave the app without one.
 */
export function applyAccentColor(color: unknown): void {
    const accent = isAccentColor(color) ? color : DEFAULT_ACCENT_COLOR;
    // The default palette is what the stylesheet uses without the attribute
    if (accent === DEFAULT_ACCENT_COLOR) {
        delete document.documentElement.dataset.accent;
    } else {
        document.documentElement.dataset.accent = accent;
    }
}
