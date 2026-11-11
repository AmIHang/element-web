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

import * as stories from "./MessagePromptView.stories";
import { MessagePromptView, type MessagePromptViewActions, type MessagePromptViewSnapshot } from "./MessagePromptView";
import { MockViewModel } from "../../../core/viewmodel/MockViewModel";

const { Default, WithPrompt, Generating, NotConnected } = composeStories(stories);

class TestViewModel extends MockViewModel<MessagePromptViewSnapshot> implements MessagePromptViewActions {
    public setPrompt = vi.fn();
    public submit = vi.fn();
    public cancel = vi.fn();
}

describe("MessagePromptView", () => {
    describe("Storybook snapshots", () => {
        it("renders an empty prompt", () => {
            const { container } = render(<Default />);
            expect(container).toMatchSnapshot();
        });

        it("renders while the message is written", () => {
            const { container } = render(<Generating />);
            expect(container).toMatchSnapshot();
        });

        it("renders an error", () => {
            const { container } = render(<NotConnected />);
            expect(container).toMatchSnapshot();
        });
    });

    it("focuses the instruction field and only allows writing once there is an instruction", () => {
        render(<Default />);

        expect(screen.getByRole("textbox", { name: "What should the message say?" })).toHaveFocus();
        expect(screen.getByRole("button", { name: "Write message" })).toBeDisabled();
    });

    it("passes what is typed to the view model", async () => {
        const user = userEvent.setup();
        const vm = new TestViewModel({ prompt: "", isGenerating: false });
        render(<MessagePromptView vm={vm} />);

        await user.type(screen.getByRole("textbox"), "x");

        expect(vm.setPrompt).toHaveBeenCalledWith("x");
    });

    it("writes the message on Enter and on the button, but not on Shift+Enter", async () => {
        const user = userEvent.setup();
        const vm = new TestViewModel({ prompt: "Tell Phillip to fix the bugs", isGenerating: false });
        render(<MessagePromptView vm={vm} />);

        await user.keyboard("{Shift>}{Enter}{/Shift}");
        expect(vm.submit).not.toHaveBeenCalled();

        await user.keyboard("{Enter}");
        expect(vm.submit).toHaveBeenCalledTimes(1);

        await user.click(screen.getByRole("button", { name: "Write message" }));
        expect(vm.submit).toHaveBeenCalledTimes(2);
    });

    it("doesn't write on Enter without an instruction", async () => {
        const user = userEvent.setup();
        const vm = new TestViewModel({ prompt: "  ", isGenerating: false });
        render(<MessagePromptView vm={vm} />);

        await user.keyboard("{Enter}");

        expect(vm.submit).not.toHaveBeenCalled();
    });

    it("disables the controls while the message is written", () => {
        render(<Generating />);

        expect(screen.getByRole("textbox")).toBeDisabled();
        expect(screen.getByRole("button", { name: "Writing…" })).toBeDisabled();
    });

    it("shows the error", () => {
        render(<NotConnected />);

        expect(screen.getByRole("alert").textContent).toContain("Connect Claude or GitHub Copilot");
        expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
    });

    it("cancels", async () => {
        const user = userEvent.setup();
        const vm = new TestViewModel({ prompt: "", isGenerating: false });
        render(<MessagePromptView vm={vm} />);

        await user.click(screen.getByRole("button", { name: "Cancel" }));

        expect(vm.cancel).toHaveBeenCalled();
    });

    it("keeps the instruction of the story", () => {
        render(<WithPrompt />);

        expect(screen.getByRole("textbox")).toHaveValue("Tell Phillip he should finally fix the bugs");
    });
});
