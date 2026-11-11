/*
 * Copyright 2026 Element Creations Ltd.
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE files in the repository root for full details.
 */

// @vitest-environment happy-dom

import { vi, describe, it, expect, beforeEach, afterEach, type Mocked } from "vitest";
import { type MatrixClient, type MatrixEvent, MsgType, type Room } from "matrix-js-sdk/src/matrix";
import { mkEvent, mkMessage, stubClient } from "test-utils";
import type { AgentResult } from "shared-types";

import { ChatSummaryViewModel, SUMMARY_LENGTH } from "./ChatSummaryViewModel";
import type { AgentApi } from "../../agent/AgentApi";
import { AGENT_REPLY_MARKER } from "../../agent/AgentReplyListener";
import DMRoomMap from "../../utils/DMRoomMap";
import defaultDispatcher from "../../dispatcher/dispatcher";
import { Action } from "../../dispatcher/actions";
import { UserTab } from "../../components/views/dialogs/UserTab";

const PARTNER = "@bob:example.org";
const SUMMARY = "- Bob asked about the release\n- The agent said Alice would come back to it";

describe("ChatSummaryViewModel", () => {
    let client: Mocked<MatrixClient>;
    let agent: Mocked<Pick<AgentApi, "generateSummary">>;
    let room: Room;
    let events: MatrixEvent[];
    let me: string;
    let vm: ChatSummaryViewModel | undefined;

    function message(sender: string, body: string, ts = 1000, msgtype: string = MsgType.Text): MatrixEvent {
        const event = mkMessage({ room: room.roomId, user: sender, msg: body, ts, event: true });
        event.getContent().msgtype = msgtype;
        return event;
    }

    /** Create the view model and wait for it to write the summary */
    async function createViewModel(): Promise<ChatSummaryViewModel> {
        vm = new ChatSummaryViewModel({ client, room, agent: agent as unknown as AgentApi });
        await vi.waitFor(() => expect(vm!.getSnapshot().loading).toBe(false));
        return vm;
    }

    beforeEach(() => {
        client = stubClient() as Mocked<MatrixClient>;
        me = client.getSafeUserId();
        events = [];
        const timeline = { getEvents: () => events };
        room = {
            roomId: "!room:example.org",
            name: "Bob",
            getLiveTimeline: () => timeline,
            getMember: (userId: string) => ({ name: userId === me ? "Alice" : "Bob" }),
        } as unknown as Room;
        // Nothing older to load, unless a test says otherwise
        client.paginateEventTimeline = vi.fn().mockResolvedValue(false);
        DMRoomMap.setShared({ getUserIdForRoomId: () => PARTNER } as unknown as DMRoomMap);
        agent = { generateSummary: vi.fn().mockResolvedValue({ ok: true, data: SUMMARY }) };
    });

    afterEach(() => {
        vm?.dispose();
        vm = undefined;
        vi.restoreAllMocks();
    });

    it("summarises the latest messages when created, marking the agent's replies", async () => {
        events.push(
            message(PARTNER, "Can we release on Friday?", 1000),
            message(me, "Alice will come back to you", 2000, MsgType.Notice),
            message(me, "Friday works", 3000),
        );

        await createViewModel();

        expect(agent.generateSummary).toHaveBeenCalledWith({
            ownName: "Alice",
            chatName: "Bob",
            isDirect: true,
            messages: [
                { sender: PARTNER, own: false, byAgent: false, ts: 1000, text: "Can we release on Friday?" },
                { sender: me, own: true, byAgent: true, ts: 2000, text: "Alice will come back to you" },
                { sender: me, own: true, byAgent: false, ts: 3000, text: "Friday works" },
            ],
        });
        expect(vm!.getSnapshot()).toEqual({ loading: false, summary: SUMMARY, messageCount: 3, error: undefined });
    });

    it("recognises replies of the agent sent as normal messages with the marker", async () => {
        const reply = message(me, "Alice is away");
        reply.getContent()[AGENT_REPLY_MARKER] = true;
        events.push(reply);

        await createViewModel();

        expect(agent.generateSummary.mock.calls[0][0].messages[0].byAgent).toBe(true);
    });

    it("leaves out other events, empty messages and edits", async () => {
        const edit = message(PARTNER, "* fixed");
        vi.spyOn(edit, "isRelation").mockReturnValue(true);
        events.push(
            mkEvent({ type: "m.room.topic", room: room.roomId, user: PARTNER, content: { topic: "x" }, event: true }),
            message(PARTNER, "  "),
            edit,
            message(PARTNER, "Hello"),
        );

        await createViewModel();

        expect(agent.generateSummary.mock.calls[0][0].messages.map((m) => m.text)).toEqual(["Hello"]);
        expect(vm!.getSnapshot().messageCount).toBe(1);
    });

    it("summarises at most the latest messages", async () => {
        for (let i = 0; i < SUMMARY_LENGTH + 5; i++) events.push(message(PARTNER, `Message ${i}`));

        await createViewModel();

        const messages = agent.generateSummary.mock.calls[0][0].messages;
        expect(messages).toHaveLength(SUMMARY_LENGTH);
        expect(messages.at(-1)!.text).toBe(`Message ${SUMMARY_LENGTH + 4}`);
        expect(client.paginateEventTimeline).not.toHaveBeenCalled();
    });

    it("loads older messages when too few are loaded", async () => {
        events.push(message(PARTNER, "New"));
        vi.mocked(client.paginateEventTimeline).mockImplementationOnce(async () => {
            events.unshift(message(PARTNER, "Old"));
            return true;
        });

        await createViewModel();

        expect(agent.generateSummary.mock.calls[0][0].messages.map((m) => m.text)).toEqual(["Old", "New"]);
    });

    it("summarises the loaded messages if older ones can't be loaded", async () => {
        events.push(message(PARTNER, "Hello"));
        vi.mocked(client.paginateEventTimeline).mockRejectedValue(new Error("offline"));

        await createViewModel();

        expect(agent.generateSummary).toHaveBeenCalled();
        expect(vm!.getSnapshot().summary).toBe(SUMMARY);
    });

    it("says so when there is nothing to summarise", async () => {
        await createViewModel();

        expect(agent.generateSummary).not.toHaveBeenCalled();
        expect(vm!.getSnapshot()).toMatchObject({ loading: false, messageCount: 0, error: "no_messages" });
    });

    it.each<[string, AgentResult<string> | Error, string]>([
        ["no provider is connected", { ok: false, error: "not_connected" }, "not_connected"],
        ["the provider fails", { ok: false, error: "unavailable", message: "down" }, "failed"],
        ["the agent can't be reached", new Error("IPC failed"), "failed"],
    ])("shows an error when %s", async (_, result, error) => {
        events.push(message(PARTNER, "Hello"));
        if (result instanceof Error) agent.generateSummary.mockRejectedValue(result);
        else agent.generateSummary.mockResolvedValue(result);

        await createViewModel();

        expect(vm!.getSnapshot()).toMatchObject({ loading: false, summary: "", error });
    });

    it("writes the summary again on refresh, for the messages as they are now", async () => {
        events.push(message(PARTNER, "Hello"));
        await createViewModel();
        events.push(message(PARTNER, "Are you there?"));
        agent.generateSummary.mockResolvedValue({ ok: true, data: "- Bob is waiting" });

        vm!.refresh();
        expect(vm!.getSnapshot()).toMatchObject({ loading: true, summary: "" });
        await vi.waitFor(() => expect(vm!.getSnapshot().loading).toBe(false));

        expect(agent.generateSummary).toHaveBeenCalledTimes(2);
        expect(vm!.getSnapshot()).toMatchObject({ summary: "- Bob is waiting", messageCount: 2 });
    });

    it("only shows the answer to the latest request", async () => {
        events.push(message(PARTNER, "Hello"));
        let finishFirst!: (result: AgentResult<string>) => void;
        agent.generateSummary.mockReturnValueOnce(new Promise((resolve) => (finishFirst = resolve)));
        vm = new ChatSummaryViewModel({ client, room, agent: agent as unknown as AgentApi });
        await vi.waitFor(() => expect(agent.generateSummary).toHaveBeenCalledTimes(1));

        agent.generateSummary.mockResolvedValue({ ok: true, data: "- Newer" });
        vm.refresh();
        await vi.waitFor(() => expect(vm!.getSnapshot().summary).toBe("- Newer"));
        finishFirst({ ok: true, data: "- Older" });
        await Promise.resolve();

        expect(vm.getSnapshot().summary).toBe("- Newer");
    });

    it("opens the agent settings and tells whoever shows the summary", async () => {
        const dispatch = vi.spyOn(defaultDispatcher, "dispatch").mockImplementation(() => {});
        const onSettingsOpened = vi.fn();
        vm = new ChatSummaryViewModel({ client, room, agent: agent as unknown as AgentApi, onSettingsOpened });

        vm.openSettings();

        expect(dispatch).toHaveBeenCalledWith({ action: Action.ViewUserSettings, initialTabId: UserTab.Agent });
        expect(onSettingsOpened).toHaveBeenCalled();
    });
});
