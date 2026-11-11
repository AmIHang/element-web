/*
 * Copyright 2026 Element Creations Ltd.
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE files in the repository root for full details.
 */

import React, { type JSX } from "react";
import { fn } from "storybook/test";

import type { Meta, StoryObj } from "@storybook/react-vite";
import {
    AccentColorPickerView,
    type AccentColorPickerViewActions,
    type AccentColorPickerViewSnapshot,
} from "./AccentColorPickerView";
import { useMockedViewModel } from "../../core/viewmodel";
import { withViewDocs } from "../../../.storybook/withViewDocs";

type AccentColorPickerProps = AccentColorPickerViewSnapshot & AccentColorPickerViewActions;

const AccentColorPickerViewWrapperImpl = ({ setColor, ...rest }: AccentColorPickerProps): JSX.Element => {
    const vm = useMockedViewModel(rest, { setColor });
    return <AccentColorPickerView vm={vm} />;
};
const AccentColorPickerViewWrapper = withViewDocs(AccentColorPickerViewWrapperImpl, AccentColorPickerView);

const meta = {
    title: "Settings/AccentColorPickerView",
    component: AccentColorPickerViewWrapper,
    tags: ["autodocs"],
    args: {
        colors: ["purple", "blue", "cyan", "green", "orange", "pink"],
        selected: "purple",
        setColor: fn(),
    },
} satisfies Meta<typeof AccentColorPickerViewWrapper>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const BlueSelected: Story = {
    args: { selected: "blue" },
};
