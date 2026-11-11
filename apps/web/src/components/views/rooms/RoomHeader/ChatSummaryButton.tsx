/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX } from "react";
import { IconButton, Tooltip } from "@vector-im/compound-web";
import AiIcon from "@vector-im/compound-design-tokens/assets/web/icons/ai";
import { type Room } from "matrix-js-sdk/src/matrix";

import { _t } from "../../../../languageHandler";
import Modal from "../../../../Modal";
import PlatformPeg from "../../../../PlatformPeg";
import { useMatrixClientContext } from "../../../../contexts/MatrixClientContext";
import { ChatSummaryDialog } from "../../dialogs/ChatSummaryDialog";

/**
 * A room header button that summarises the latest messages of the room with the agent of the platform. Shows
 * nothing on a platform without an agent.
 */
export function ChatSummaryButton({ room }: Readonly<{ room: Room }>): JSX.Element | null {
    const client = useMatrixClientContext();
    const agent = PlatformPeg.get()?.agent;
    if (!agent) return null;

    const label = _t("room|chat_summary|button");
    return (
        <Tooltip label={label}>
            <IconButton
                aria-label={label}
                onClick={(evt) => {
                    evt.stopPropagation();
                    Modal.createDialog(ChatSummaryDialog, { client, room, agent });
                }}
            >
                <AiIcon />
            </IconButton>
        </Tooltip>
    );
}
