/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// @vitest-environment happy-dom

import { vi, describe, it, expect, afterEach } from "vitest";
import React from "react";
import { Room } from "matrix-js-sdk/src/matrix";
import { render, screen, fireEvent } from "test-utils-rtl";
import { mockPlatformPeg, stubClient, unmockPlatformPeg } from "test-utils";

import { ChatSummaryButton } from "./ChatSummaryButton";
import Modal from "../../../../Modal";
import { ChatSummaryDialog } from "../../dialogs/ChatSummaryDialog";
import type { AgentApi } from "../../../../agent/AgentApi";
import MatrixClientContext from "../../../../contexts/MatrixClientContext";

describe("<ChatSummaryButton />", () => {
    afterEach(() => {
        unmockPlatformPeg();
        vi.restoreAllMocks();
    });

    function renderButton(): Room {
        const client = stubClient();
        const room = new Room("!room:example.org", client, client.getSafeUserId());
        render(
            <MatrixClientContext.Provider value={client}>
                <ChatSummaryButton room={room} />
            </MatrixClientContext.Provider>,
        );
        return room;
    }

    it("shows nothing on a platform without an agent", () => {
        mockPlatformPeg({});
        renderButton();

        expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("opens the summary of the room", () => {
        const agent = {} as AgentApi;
        // The agent is a getter on the platform, so it can't be passed to mockPlatformPeg
        Object.defineProperty(mockPlatformPeg({}), "agent", { value: agent });
        const createDialog = vi
            .spyOn(Modal, "createDialog")
            .mockReturnValue({} as ReturnType<typeof Modal.createDialog>);
        const room = renderButton();

        fireEvent.click(screen.getByRole("button", { name: "Summarise latest messages" }));

        expect(createDialog).toHaveBeenCalledWith(ChatSummaryDialog, expect.objectContaining({ room, agent }));
    });
});
