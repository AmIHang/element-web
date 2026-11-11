/*
 * Copyright 2026 Element Creations Ltd.
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE files in the repository root for full details.
 */

import React, { type JSX } from "react";
import { fn } from "storybook/test";

import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChatSummaryView, type ChatSummaryViewActions, type ChatSummaryViewSnapshot } from "./ChatSummaryView";
import { useMockedViewModel } from "../../core/viewmodel";
import { withViewDocs } from "../../../.storybook/withViewDocs";

type ChatSummaryProps = ChatSummaryViewSnapshot & ChatSummaryViewActions;

const ChatSummaryViewWrapperImpl = ({ refresh, openSettings, ...rest }: ChatSummaryProps): JSX.Element => {
    const vm = useMockedViewModel(rest, { refresh, openSettings });
    return <ChatSummaryView vm={vm} />;
};
const ChatSummaryViewWrapper = withViewDocs(ChatSummaryViewWrapperImpl, ChatSummaryView);

const meta = {
    title: "Room/ChatSummaryView",
    component: ChatSummaryViewWrapper,
    tags: ["autodocs"],
    args: {
        loading: false,
        messageCount: 24,
        summary: [
            "- Alice asked whether the release can move to Friday; the agent said Amy would come back to it.",
            "- Bob shared the CI failure on the Windows build and a link to the log.",
            "- The agent confirmed that the demo slides are in the shared folder.",
            "Open for you",
            "- Decide on the release date.",
            "- Look at the failing Windows build.",
        ].join("\n"),
        refresh: fn(),
        openSettings: fn(),
    },
} satisfies Meta<typeof ChatSummaryViewWrapper>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Loading: Story = {
    args: { loading: true, summary: "" },
};

export const NotConnected: Story = {
    args: { summary: "", error: "not_connected" },
};

export const NoMessages: Story = {
    args: { summary: "", messageCount: 0, error: "no_messages" },
};

export const Failed: Story = {
    args: { summary: "", error: "failed" },
};
