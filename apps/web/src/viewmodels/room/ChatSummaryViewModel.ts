/*
 * Copyright 2026 Element Creations Ltd.
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE files in the repository root for full details.
 */

import { EventType, type MatrixClient, MsgType, RelationType, type Room } from "matrix-js-sdk/src/matrix";
import { logger } from "matrix-js-sdk/src/logger";
import {
    BaseViewModel,
    type ChatSummaryViewModel as ChatSummaryViewModelInterface,
    type ChatSummaryViewSnapshot,
} from "@element-hq/web-shared-components";
import type { AgentSummaryMessage } from "shared-types";

import type { AgentApi } from "../../agent/AgentApi";
import { AGENT_REPLY_MARKER } from "../../agent/AgentReplyListener";
import DMRoomMap from "../../utils/DMRoomMap";
import defaultDispatcher from "../../dispatcher/dispatcher";
import { Action } from "../../dispatcher/actions";
import { UserTab } from "../../components/views/dialogs/UserTab";

/** How many of the latest messages are summarised */
export const SUMMARY_LENGTH = 50;

/** How often to load older messages from the server when the room has fewer than {@link SUMMARY_LENGTH} loaded */
const MAX_PAGINATIONS = 3;

export interface ChatSummaryViewModelProps {
    client: MatrixClient;
    room: Room;
    /** The agent of the platform, which writes the summary */
    agent: AgentApi;
    /** Called when the agent settings are opened, so that whatever shows the summary can close */
    onSettingsOpened?: () => void;
}

/**
 * Summarises the latest messages of a room with the agent of the platform, so that the user can quickly catch up,
 * for example on what the agent answered for them in agent mode.
 *
 * The summary is written as soon as the view model is created, and again when the user asks for it.
 */
export class ChatSummaryViewModel
    extends BaseViewModel<ChatSummaryViewSnapshot, ChatSummaryViewModelProps>
    implements ChatSummaryViewModelInterface
{
    /** Counts the requests, so that only the answer to the latest one is shown */
    private requestId = 0;

    public constructor(props: ChatSummaryViewModelProps) {
        super(props, { loading: true, summary: "", messageCount: 0 });
        void this.summarise();
    }

    public refresh = (): void => {
        void this.summarise();
    };

    public openSettings = (): void => {
        defaultDispatcher.dispatch({ action: Action.ViewUserSettings, initialTabId: UserTab.Agent });
        this.props.onSettingsOpened?.();
    };

    private async summarise(): Promise<void> {
        const requestId = ++this.requestId;
        const isCurrent = (): boolean => requestId === this.requestId && !this.disposables.isDisposed;
        this.snapshot.merge({ loading: true, summary: "", error: undefined });

        const { client, room, agent } = this.props;
        const messages = await this.getMessages();
        if (!isCurrent()) return;
        if (messages.length === 0) {
            this.snapshot.merge({ loading: false, messageCount: 0, error: "no_messages" });
            return;
        }
        this.snapshot.merge({ messageCount: messages.length });

        const myUserId = client.getSafeUserId();
        const result = await agent
            .generateSummary({
                ownName: room.getMember(myUserId)?.name ?? myUserId,
                chatName: room.name,
                isDirect: Boolean(DMRoomMap.shared()?.getUserIdForRoomId(room.roomId)),
                messages,
            })
            .catch((e) => {
                logger.warn(`Could not summarise ${room.roomId}`, e);
                return undefined;
            });
        if (!isCurrent()) return;

        if (!result?.ok) {
            if (result) logger.warn(`Could not summarise ${room.roomId}: ${result.error}`, result.message);
            this.snapshot.merge({
                loading: false,
                error: result?.error === "not_connected" ? "not_connected" : "failed",
            });
            return;
        }
        this.snapshot.merge({ loading: false, summary: result.data });
    }

    /**
     * The latest messages of the room with text, oldest first. Older messages are loaded from the server if the
     * room has fewer loaded.
     */
    private async getMessages(): Promise<AgentSummaryMessage[]> {
        const { client, room } = this.props;
        const timeline = room.getLiveTimeline();
        let messages = this.readMessages();
        for (let i = 0; i < MAX_PAGINATIONS && messages.length < SUMMARY_LENGTH; i++) {
            try {
                const more = await client.paginateEventTimeline(timeline, { backwards: true, limit: SUMMARY_LENGTH });
                if (this.disposables.isDisposed) return [];
                // The type and content of encrypted messages are only known once they are decrypted
                await Promise.all(timeline.getEvents().map((event) => client.decryptEventIfNeeded(event)));
                messages = this.readMessages();
                if (!more) break;
            } catch (e) {
                logger.warn(`Could not load older messages of ${room.roomId} to summarise`, e);
                break;
            }
        }
        return messages;
    }

    /** The messages with text in the loaded part of the live timeline, at most the latest {@link SUMMARY_LENGTH} */
    private readMessages(): AgentSummaryMessage[] {
        const myUserId = this.props.client.getSafeUserId();
        const messages: AgentSummaryMessage[] = [];
        for (const event of this.props.room.getLiveTimeline().getEvents()) {
            if (event.getType() !== EventType.RoomMessage || event.isRedacted()) continue;
            if (event.isRelation(RelationType.Replace)) continue;
            // An edited message shows its latest text
            const content = event.getContent();
            const { body } = content;
            if (typeof body !== "string" || !body.trim()) continue;
            const own = event.getSender() === myUserId;
            messages.push({
                sender: event.sender?.name ?? event.getSender() ?? "",
                own,
                // The agent's replies are sent by the user, marked as notices or with the agent's marker
                byAgent: own && (content.msgtype === MsgType.Notice || Boolean(content[AGENT_REPLY_MARKER])),
                ts: event.getTs(),
                text: body,
            });
        }
        return messages.slice(-SUMMARY_LENGTH);
    }
}
