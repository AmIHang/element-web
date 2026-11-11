/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX } from "react";
import { type MatrixClient, type Room } from "matrix-js-sdk/src/matrix";
import { ChatSummaryView, useCreateAutoDisposedViewModel } from "@element-hq/web-shared-components";

import { _t } from "../../../languageHandler";
import BaseDialog from "./BaseDialog";
import type { AgentApi } from "../../../agent/AgentApi";
import { ChatSummaryViewModel } from "../../../viewmodels/room/ChatSummaryViewModel";

interface ChatSummaryDialogProps {
    client: MatrixClient;
    /** The room whose latest messages are summarised */
    room: Room;
    /** The agent of the platform, which writes the summary */
    agent: AgentApi;
    onFinished(): void;
}

/**
 * A dialog with a summary of the latest messages of a room, written by the agent of the platform.
 */
export function ChatSummaryDialog({ client, room, agent, onFinished }: Readonly<ChatSummaryDialogProps>): JSX.Element {
    const vm = useCreateAutoDisposedViewModel(
        () => new ChatSummaryViewModel({ client, room, agent, onSettingsOpened: onFinished }),
    );
    return (
        <BaseDialog
            className="mx_ChatSummaryDialog"
            title={_t("room|chat_summary|title", { roomName: room.name })}
            onFinished={onFinished}
        >
            <ChatSummaryView vm={vm} />
        </BaseDialog>
    );
}
