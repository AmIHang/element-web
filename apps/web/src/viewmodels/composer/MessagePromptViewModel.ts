/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { type MatrixClient, type Room } from "matrix-js-sdk/src/matrix";
import { logger } from "matrix-js-sdk/src/logger";
import {
    BaseViewModel,
    type MessagePromptError,
    type MessagePromptViewModel as MessagePromptViewModelInterface,
    type MessagePromptViewSnapshot,
} from "@element-hq/web-shared-components";
import type { AgentErrorCode } from "shared-types";

import type { AgentApi } from "../../agent/AgentApi";
import { getChatMessages } from "../../agent/getChatMessages";
import DMRoomMap from "../../utils/DMRoomMap";
import defaultDispatcher from "../../dispatcher/dispatcher";
import { Action } from "../../dispatcher/actions";
import { type ComposerInsertPayload } from "../../dispatcher/payloads/ComposerInsertPayload";
import { type TimelineRenderingType } from "../../contexts/RoomContext";

export interface MessagePromptViewModelProps {
    client: MatrixClient;
    /** The room the message is for */
    room: Room;
    /** The agent of the platform, which writes the message */
    agent: AgentApi;
    /** Which composer the message is put into: the one of the room, or of a thread */
    timelineRenderingType: TimelineRenderingType;
    /** Called once the message is in the composer, or the user gave up */
    onFinished: () => void;
}

/**
 * Turn the error of the platform into one the prompt can show.
 */
export function toPromptError(error: AgentErrorCode): MessagePromptError {
    switch (error) {
        case "not_connected":
        case "rate_limited":
        case "refused":
        case "unavailable":
            return error;
        case "invalid_credential":
            return "not_connected";
        default:
            return "unknown";
    }
}

/**
 * Writes a message from a short instruction of the user, such as "tell Phillip to finally fix the bugs", with the
 * agent of the platform, and puts it into the composer so it can be edited before sending.
 */
export class MessagePromptViewModel
    extends BaseViewModel<MessagePromptViewSnapshot, MessagePromptViewModelProps>
    implements MessagePromptViewModelInterface
{
    public constructor(props: MessagePromptViewModelProps) {
        super(props, { prompt: "", isGenerating: false });
    }

    public setPrompt = (prompt: string): void => {
        this.snapshot.merge({ prompt });
    };

    public cancel = (): void => {
        this.props.onFinished();
    };

    public submit = async (): Promise<void> => {
        const { prompt, isGenerating } = this.snapshot.current;
        if (isGenerating || !prompt.trim()) return;
        this.snapshot.merge({ isGenerating: true, error: undefined });

        const { room, client, agent } = this.props;
        const myUserId = client.getSafeUserId();
        const partnerId = DMRoomMap.shared()?.getUserIdForRoomId(room.roomId);
        const result = await agent
            .generateMessage({
                ownName: room.getMember(myUserId)?.name ?? myUserId,
                chatName: room.name,
                isDirect: Boolean(partnerId),
                partnerId,
                instruction: prompt.trim(),
                messages: getChatMessages(room, myUserId),
            })
            .catch((e) => {
                logger.warn(`Could not write a message from a prompt in ${room.roomId}`, e);
                return undefined;
            });
        // The dialog was closed while the message was written
        if (this.disposables.isDisposed) return;

        if (!result?.ok) {
            if (result) logger.warn(`Could not write a message from a prompt: ${result.error}`, result.message);
            this.snapshot.merge({ isGenerating: false, error: result ? toPromptError(result.error) : "unknown" });
            return;
        }

        defaultDispatcher.dispatch<ComposerInsertPayload>({
            action: Action.ComposerInsert,
            text: result.data,
            timelineRenderingType: this.props.timelineRenderingType,
        });
        this.props.onFinished();
    };
}
