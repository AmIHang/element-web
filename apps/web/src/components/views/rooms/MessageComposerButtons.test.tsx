/*
Copyright 2024 New Vector Ltd.
Copyright 2022 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// @vitest-environment happy-dom

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "test-utils-rtl";
import { createTestClient, getRoomContext, mkStubRoom } from "test-utils";

import MatrixClientContext from "../../../contexts/MatrixClientContext";
import { MatrixClientPeg } from "../../../MatrixClientPeg";
import MessageComposerButtons from "./MessageComposerButtons";
import { ScopedRoomContextProvider } from "../../../contexts/ScopedRoomContext.tsx";
import { type RoomContextType } from "../../../contexts/RoomContext.ts";
import { RoomUploadContextProvider } from "../../../viewmodels/room/RoomUploadViewModel.tsx";
import PlatformPeg from "../../../PlatformPeg";
import type BasePlatform from "../../../BasePlatform";
import type { AgentApi } from "../../../agent/AgentApi";
import Modal from "../../../Modal";
import { MessagePromptDialog } from "../dialogs/MessagePromptDialog";

describe("MessageComposerButtons", () => {
    // @ts-ignore - we're deliberately not implementing the whole interface here, but
    // can't use Partial<> for types because it'll annoy TS more than it helps.
    const mockProps: React.ComponentProps<typeof MessageComposerButtons> = {
        addEmoji: () => false,
        haveRecording: false,
        isStickerPickerOpen: false,
        menuPosition: undefined,
        onRecordStartEndClick: () => {},
        setStickerPickerOpen: () => {},
        toggleButtonMenu: () => {},
    };

    const mockClient = createTestClient();
    vi.spyOn(MatrixClientPeg, "get").mockReturnValue(mockClient);

    function getButtonLabels() {
        const getLabels = (elements: HTMLElement[]): string[] =>
            elements
                .map((element) => element.getAttribute("aria-label"))
                .filter((label): label is string => label !== null);

        const mainLabels: Array<string | string[]> = getLabels(screen.queryAllByRole("button"));
        const menuLabels = getLabels(screen.queryAllByRole("menuitem"));

        if (menuLabels.length) {
            mainLabels.push(getLabels(screen.queryAllByRole("menuitem")));
        }

        return mainLabels;
    }

    function wrapAndRender(component: React.ReactElement, narrow: boolean) {
        const mockRoom = mkStubRoom("myfakeroom", "myfakeroom", mockClient) as any;
        const defaultRoomContext: RoomContextType = getRoomContext(mockRoom, { narrow });

        return render(
            <MatrixClientContext.Provider value={mockClient}>
                <ScopedRoomContextProvider {...defaultRoomContext}>
                    <RoomUploadContextProvider>{component}</RoomUploadContextProvider>
                </ScopedRoomContextProvider>
            </MatrixClientContext.Provider>,
        );
    }

    it("Renders emoji and upload buttons in wide mode", () => {
        wrapAndRender(
            <MessageComposerButtons
                {...mockProps}
                isMenuOpen={false}
                showLocationButton={true}
                showPollsButton={true}
                showStickersButton={true}
            />,
            false,
        );

        expect(getButtonLabels()).toEqual(["Emoji", "Attachment", "More options"]);
    });

    it("Renders other buttons in menu in wide mode", async () => {
        wrapAndRender(
            <MessageComposerButtons
                {...mockProps}
                isMenuOpen={true}
                showLocationButton={true}
                showPollsButton={true}
                showStickersButton={true}
            />,
            false,
        );

        // The location code is lazy loaded, so the button will take a little while
        // to appear, so we need to wait.
        await waitFor(() => {
            expect(getButtonLabels()).toEqual([
                "Emoji",
                "Attachment",
                "More options",
                ["Sticker", "Voice Message", "Poll", "Location"],
            ]);
        });
    });

    it("Renders only some buttons in narrow mode", () => {
        wrapAndRender(
            <MessageComposerButtons
                {...mockProps}
                isMenuOpen={false}
                showLocationButton={true}
                showPollsButton={true}
                showStickersButton={true}
            />,
            true,
        );

        expect(getButtonLabels()).toEqual(["Emoji", "More options"]);
    });

    it("Renders other buttons in menu (except voice messages) in narrow mode", () => {
        wrapAndRender(
            <MessageComposerButtons
                {...mockProps}
                isMenuOpen={true}
                showLocationButton={true}
                showPollsButton={true}
                showStickersButton={true}
            />,
            true,
        );

        expect(getButtonLabels()).toEqual(["Emoji", "More options", ["Attachment", "Sticker", "Poll", "Location"]]);
    });

    describe("polls button", () => {
        it("should render when asked to", () => {
            wrapAndRender(
                <MessageComposerButtons
                    {...mockProps}
                    isMenuOpen={true}
                    showLocationButton={true}
                    showPollsButton={true}
                    showStickersButton={true}
                />,
                true,
            );

            expect(getButtonLabels()).toEqual(["Emoji", "More options", ["Attachment", "Sticker", "Poll", "Location"]]);
        });

        it("should not render when asked not to", () => {
            wrapAndRender(
                <MessageComposerButtons
                    {...mockProps}
                    isMenuOpen={true}
                    showLocationButton={true}
                    showPollsButton={false} // !! the change from the alternate test
                    showStickersButton={true}
                />,
                true,
            );

            expect(getButtonLabels()).toEqual([
                "Emoji",
                "More options",
                [
                    "Attachment",
                    "Sticker",
                    // "Poll", // should be hidden
                    "Location",
                ],
            ]);
        });
    });
    describe("prompt button", () => {
        const agent = {} as AgentApi;

        beforeEach(() => {
            vi.spyOn(PlatformPeg, "get").mockReturnValue({ agent } as BasePlatform);
        });

        afterEach(() => {
            vi.mocked(PlatformPeg.get).mockRestore();
        });

        it("is shown next to the upload button on a platform with an agent, and opens the prompt", () => {
            const createDialog = vi
                .spyOn(Modal, "createDialog")
                .mockReturnValue({} as ReturnType<typeof Modal.createDialog>);
            wrapAndRender(
                <MessageComposerButtons
                    {...mockProps}
                    isMenuOpen={false}
                    showLocationButton={true}
                    showPollsButton={true}
                    showStickersButton={true}
                />,
                false,
            );

            expect(getButtonLabels()).toEqual(["Emoji", "Attachment", "Write a message from a prompt", "More options"]);

            screen.getByRole("button", { name: "Write a message from a prompt" }).click();
            expect(createDialog).toHaveBeenCalledWith(MessagePromptDialog, expect.objectContaining({ agent }));
            createDialog.mockRestore();
        });

        it("is in the menu in narrow mode", () => {
            wrapAndRender(
                <MessageComposerButtons
                    {...mockProps}
                    isMenuOpen={true}
                    showLocationButton={false}
                    showPollsButton={false}
                    showStickersButton={false}
                />,
                true,
            );

            expect(getButtonLabels()).toEqual([
                "Emoji",
                "More options",
                ["Attachment", "Write a message from a prompt"],
            ]);
        });
    });
});
