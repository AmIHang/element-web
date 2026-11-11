/*
 * Copyright 2026 Element Creations Ltd.
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE files in the repository root for full details.
 */

import { render, screen } from "@test-utils";
import { composeStories } from "@storybook/react-vite";
import React from "react";
import userEvent from "@testing-library/user-event";
import { describe, it, vi, expect } from "vitest";

import * as stories from "./ChatSummaryView.stories";
import { ChatSummaryView, type ChatSummaryViewActions, type ChatSummaryViewSnapshot } from "./ChatSummaryView";
import { MockViewModel } from "../../core/viewmodel/MockViewModel";

const { Default, Loading, NotConnected, NoMessages, Failed } = composeStories(stories);

class TestViewModel extends MockViewModel<ChatSummaryViewSnapshot> implements ChatSummaryViewActions {
    public refresh = vi.fn();
    public openSettings = vi.fn();
}

function renderSummary(snapshot: Partial<ChatSummaryViewSnapshot>): TestViewModel {
    const vm = new TestViewModel({ loading: false, summary: "", messageCount: 3, ...snapshot });
    render(<ChatSummaryView vm={vm} />);
    return vm;
}

describe("ChatSummaryView", () => {
    describe("Storybook snapshots", () => {
        it.each([
            ["the summary", Default],
            ["the loading state", Loading],
            ["the not connected error", NotConnected],
            ["the no messages error", NoMessages],
            ["the failed error", Failed],
        ])("renders %s", (_, Story) => {
            const { container } = render(<Story />);
            expect(container).toMatchSnapshot();
        });
    });

    it("shows the points as lists under their headings", () => {
        renderSummary({ summary: "- First\n* Second\n\n**Open for you**\n1. Decide", messageCount: 24 });

        expect(screen.getByText("Summary of the last 24 messages")).toBeInTheDocument();
        const lists = screen.getAllByRole("list");
        expect(lists).toHaveLength(2);
        expect(lists[0]).toHaveTextContent("FirstSecond");
        expect(lists[1]).toHaveTextContent("Decide");
        expect(screen.getByText("Open for you")).toBeInTheDocument();
    });

    it("strips Markdown heading markers", () => {
        renderSummary({ summary: "## Topics\n- One" });

        expect(screen.getByText("Topics")).toBeInTheDocument();
    });

    it("shows a spinner and the number of messages while loading", () => {
        renderSummary({ loading: true, messageCount: 1 });

        expect(screen.getByText("Summarising the last message…")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Summarise again" })).toBeDisabled();
    });

    it("summarises again on request", async () => {
        const vm = renderSummary({ summary: "- One" });

        await userEvent.click(screen.getByRole("button", { name: "Summarise again" }));

        expect(vm.refresh).toHaveBeenCalled();
    });

    it("offers the agent settings when no provider is connected", async () => {
        const vm = renderSummary({ error: "not_connected" });

        expect(screen.getByRole("alert")).toHaveTextContent(
            "Connect an AI provider in the agent settings to summarise chats.",
        );
        await userEvent.click(screen.getByRole("button", { name: "Open agent settings" }));

        expect(vm.openSettings).toHaveBeenCalled();
        expect(screen.queryByRole("button", { name: "Summarise again" })).not.toBeInTheDocument();
    });

    it("can't summarise again while there are no messages", () => {
        renderSummary({ error: "no_messages", messageCount: 0 });

        expect(screen.getByRole("alert")).toHaveTextContent("There are no messages to summarise in this chat yet.");
        expect(screen.getByRole("button", { name: "Summarise again" })).toBeDisabled();
    });

    it("can try again after a failure", () => {
        renderSummary({ error: "failed" });

        expect(screen.getByRole("alert")).toHaveTextContent("The summary could not be written. Try again.");
        expect(screen.getByRole("button", { name: "Summarise again" })).toBeEnabled();
    });
});
