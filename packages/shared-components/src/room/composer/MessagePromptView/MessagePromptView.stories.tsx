/*
 * Copyright 2026 Element Creations Ltd.
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE files in the repository root for full details.
 */

import React, { type JSX } from "react";
import { fn } from "storybook/test";

import type { Meta, StoryObj } from "@storybook/react-vite";
import { MessagePromptView, type MessagePromptViewActions, type MessagePromptViewSnapshot } from "./MessagePromptView";
import { useMockedViewModel } from "../../../core/viewmodel";
import { withViewDocs } from "../../../../.storybook/withViewDocs";

type MessagePromptProps = MessagePromptViewSnapshot & MessagePromptViewActions;

const MessagePromptViewWrapperImpl = ({ setPrompt, submit, cancel, ...rest }: MessagePromptProps): JSX.Element => {
    const vm = useMockedViewModel(rest, { setPrompt, submit, cancel });
    return <MessagePromptView vm={vm} />;
};
const MessagePromptViewWrapper = withViewDocs(MessagePromptViewWrapperImpl, MessagePromptView);

const meta = {
    title: "Room/Composer/MessagePromptView",
    component: MessagePromptViewWrapper,
    tags: ["autodocs"],
    args: {
        prompt: "",
        isGenerating: false,
        setPrompt: fn(),
        submit: fn(),
        cancel: fn(),
    },
} satisfies Meta<typeof MessagePromptViewWrapper>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithPrompt: Story = {
    args: {
        prompt: "Tell Phillip he should finally fix the bugs",
    },
};

export const Generating: Story = {
    args: {
        prompt: "Tell Phillip he should finally fix the bugs",
        isGenerating: true,
    },
};

export const NotConnected: Story = {
    args: {
        prompt: "Tell Phillip he should finally fix the bugs",
        error: "not_connected",
    },
};
