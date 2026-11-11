/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX } from "react";
import { type MatrixClient, type Room } from "matrix-js-sdk/src/matrix";
import { MessagePromptView, useCreateAutoDisposedViewModel } from "@element-hq/web-shared-components";

import BaseDialog from "./BaseDialog";
import { _t } from "../../../languageHandler";
import type { AgentApi } from "../../../agent/AgentApi";
import { type TimelineRenderingType } from "../../../contexts/RoomContext";
import { MessagePromptViewModel } from "../../../viewmodels/composer/MessagePromptViewModel";

interface MessagePromptDialogProps {
    client: MatrixClient;
    /** The room the message is for */
    room: Room;
    /** The agent of the platform, which writes the message */
    agent: AgentApi;
    /** Which composer the message is put into */
    timelineRenderingType: TimelineRenderingType;
    /** Called when the dialog is closed */
    onFinished: () => void;
}

/**
 * Dialog to describe a message in a few words, which the agent then writes out into the composer.
 */
export function MessagePromptDialog({
    client,
    room,
    agent,
    timelineRenderingType,
    onFinished,
}: Readonly<MessagePromptDialogProps>): JSX.Element {
    const vm = useCreateAutoDisposedViewModel(
        () => new MessagePromptViewModel({ client, room, agent, timelineRenderingType, onFinished }),
    );
    return (
        <BaseDialog onFinished={onFinished} title={_t("composer|message_prompt_title")}>
            <MessagePromptView vm={vm} />
        </BaseDialog>
    );
}
