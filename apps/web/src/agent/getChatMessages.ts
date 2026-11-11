/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { EventType, RelationType, type Room } from "matrix-js-sdk/src/matrix";
import type { AgentSuggestionMessage } from "shared-types";

/** How many of the latest messages the agent sees */
export const HISTORY_LENGTH = 30;

/**
 * The latest messages of a room with text, oldest first, as the agent sees them.
 * @param room - The room to read
 * @param myUserId - The user the agent writes for, whose messages are marked as their own
 */
export function getChatMessages(room: Room, myUserId: string): AgentSuggestionMessage[] {
    const messages: AgentSuggestionMessage[] = [];
    for (const event of room.getLiveTimeline().getEvents()) {
        if (event.getType() !== EventType.RoomMessage || event.isRedacted()) continue;
        if (event.isRelation(RelationType.Replace)) continue;
        const { body } = event.getContent();
        if (typeof body !== "string" || !body.trim()) continue;
        messages.push({
            sender: event.sender?.name ?? event.getSender() ?? "",
            own: event.getSender() === myUserId,
            text: body,
        });
    }
    return messages.slice(-HISTORY_LENGTH);
}
