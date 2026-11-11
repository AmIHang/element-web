/*
 * Copyright 2026 Element Creations Ltd.
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE files in the repository root for full details.
 */

// @vitest-environment happy-dom

import { vi, describe, it, expect, beforeEach, afterEach, type Mock, type Mocked } from "vitest";
import { type EventTimeline, type MatrixClient, type Room } from "matrix-js-sdk/src/matrix";
import { mkMessage, mkStubRoom, stubClient } from "test-utils";
import type { AgentResult } from "shared-types";

import { MessagePromptViewModel, toPromptError } from "./MessagePromptViewModel";
import type { AgentApi } from "../../agent/AgentApi";
import DMRoomMap from "../../utils/DMRoomMap";
import defaultDispatcher from "../../dispatcher/dispatcher";
import { Action } from "../../dispatcher/actions";
import { TimelineRenderingType } from "../../contexts/RoomContext";

const ROOM_ID = "!room:example.org";
const PARTNER = "@phillip:example.org";

describe("MessagePromptViewModel", () => {
    let client: MatrixClient;
    let room: Room;
    let agent: Mocked<Pick<AgentApi, "generateMessage">>;
    let onFinished: Mock<() => void>;
    let vm: MessagePromptViewModel;

    function createViewModel(): MessagePromptViewModel {
        return new MessagePromptViewModel({
            client,
            room,
            agent: agent as unknown as AgentApi,
            timelineRenderingType: TimelineRenderingType.Room,
            onFinished,
        });
    }

    beforeEach(() => {
        client = stubClient();
        room = mkStubRoom(ROOM_ID, "Phillip", client);
        const events = [mkMessage({ room: ROOM_ID, user: PARTNER, msg: "Bugs? What bugs?", event: true })];
        vi.spyOn(room, "getLiveTimeline").mockReturnValue({ getEvents: () => events } as unknown as EventTimeline);
        vi.spyOn(DMRoomMap, "shared").mockReturnValue({
            getUserIdForRoomId: vi.fn().mockReturnValue(PARTNER),
        } as unknown as DMRoomMap);
        agent = { generateMessage: vi.fn().mockResolvedValue({ ok: true, data: "Phillip, please fix the bugs." }) };
        onFinished = vi.fn();
        vi.spyOn(defaultDispatcher, "dispatch");
        vm = createViewModel();
    });

    afterEach(() => {
        vm.dispose();
        vi.restoreAllMocks();
    });

    it("starts with an empty prompt", () => {
        expect(vm.getSnapshot()).toEqual({ prompt: "", isGenerating: false });
    });

    it("writes the message from the prompt and puts it into the composer", async () => {
        vm.setPrompt("  tell Phillip to finally fix the bugs ");
        await vm.submit();

        expect(agent.generateMessage).toHaveBeenCalledWith({
            ownName: expect.any(String),
            chatName: "Phillip",
            isDirect: true,
            partnerId: PARTNER,
            instruction: "tell Phillip to finally fix the bugs",
            messages: [{ sender: PARTNER, own: false, text: "Bugs? What bugs?" }],
        });
        expect(defaultDispatcher.dispatch).toHaveBeenCalledWith({
            action: Action.ComposerInsert,
            text: "Phillip, please fix the bugs.",
            timelineRenderingType: TimelineRenderingType.Room,
        });
        expect(onFinished).toHaveBeenCalled();
    });

    it("shows that the message is being written", async () => {
        let finish!: (result: AgentResult<string>) => void;
        agent.generateMessage.mockReturnValue(new Promise((resolve) => (finish = resolve)));
        vm.setPrompt("say hi");

        const submitting = vm.submit();
        expect(vm.getSnapshot().isGenerating).toBe(true);
        // A second submit while writing is ignored
        await vm.submit();
        expect(agent.generateMessage).toHaveBeenCalledTimes(1);

        finish({ ok: true, data: "Hi!" });
        await submitting;
        expect(onFinished).toHaveBeenCalled();
    });

    it("doesn't ask without a prompt", async () => {
        vm.setPrompt("   ");
        await vm.submit();

        expect(agent.generateMessage).not.toHaveBeenCalled();
    });

    it("shows an error and stays open when the message can't be written", async () => {
        agent.generateMessage.mockResolvedValue({ ok: false, error: "not_connected" });
        vm.setPrompt("say hi");
        await vm.submit();

        expect(vm.getSnapshot()).toEqual({ prompt: "say hi", isGenerating: false, error: "not_connected" });
        expect(onFinished).not.toHaveBeenCalled();
        expect(defaultDispatcher.dispatch).not.toHaveBeenCalled();

        // Trying again clears the error
        agent.generateMessage.mockResolvedValue({ ok: true, data: "Hi!" });
        await vm.submit();
        expect(vm.getSnapshot().error).toBeUndefined();
    });

    it("shows an unknown error when the platform throws", async () => {
        agent.generateMessage.mockRejectedValue(new Error("IPC failed"));
        vm.setPrompt("say hi");
        await vm.submit();

        expect(vm.getSnapshot().error).toBe("unknown");
    });

    it("drops the message when closed while it is written", async () => {
        let finish!: (result: AgentResult<string>) => void;
        agent.generateMessage.mockReturnValue(new Promise((resolve) => (finish = resolve)));
        vm.setPrompt("say hi");

        const submitting = vm.submit();
        vm.dispose();
        finish({ ok: true, data: "Hi!" });
        await submitting;

        expect(defaultDispatcher.dispatch).not.toHaveBeenCalled();
    });

    it("cancels", () => {
        vm.cancel();
        expect(onFinished).toHaveBeenCalled();
    });

    it("maps the errors of the platform", () => {
        expect(toPromptError("rate_limited")).toBe("rate_limited");
        expect(toPromptError("refused")).toBe("refused");
        expect(toPromptError("unavailable")).toBe("unavailable");
        expect(toPromptError("invalid_credential")).toBe("not_connected");
        expect(toPromptError("invalid_request")).toBe("unknown");
    });
});
