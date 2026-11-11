/*
 * Copyright 2026 Element Creations Ltd.
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE files in the repository root for full details.
 */

import React from "react";
import { render, screen } from "@test-utils";
import userEvent from "@testing-library/user-event";
import { composeStories } from "@storybook/react-vite";
import { describe, it, expect, beforeEach, vi } from "vitest";

import * as stories from "./AccentColorPickerView.stories";

const { Default, BlueSelected } = composeStories(stories);

describe("<AccentColorPickerView />", () => {
    beforeEach(() => {
        vi.mocked(Default.args.setColor!).mockClear();
    });

    it("offers every colour as a radio button", () => {
        render(<Default />);
        expect(screen.getByRole("radiogroup", { name: "Accent colour" })).toBeInTheDocument();
        expect(screen.getAllByRole("radio")).toHaveLength(6);
    });

    it("checks the selected colour", () => {
        render(<BlueSelected />);
        expect(screen.getByRole("radio", { name: "Blue" })).toBeChecked();
        expect(screen.getByRole("radio", { name: "Purple" })).not.toBeChecked();
    });

    it("picks a colour on click", async () => {
        const user = userEvent.setup();
        render(<Default />);
        await user.click(screen.getByRole("radio", { name: "Orange" }));
        expect(Default.args.setColor).toHaveBeenCalledWith("orange");
    });
});
