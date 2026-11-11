/*
Copyright 2026 Hiroshi Shinaoka
Copyright 2020, 2021 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// @vitest-environment happy-dom

import React from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "test-utils-rtl";
import { flushPromises } from "test-utils";

import ConfirmTokenizerChangeDialog from "./ConfirmTokenizerChangeDialog";
import EventIndexPeg from "../../../../indexing/EventIndexPeg";
import { TokenizerMode } from "../../../../settings/enums/TokenizerMode";

const SUBSTRING_WARNING = /not stored securely encrypted on this computer/;

describe("<ConfirmTokenizerChangeDialog />", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("deletes the event index and finishes when confirmed", async () => {
        const onFinished = vi.fn();
        vi.spyOn(EventIndexPeg, "deleteEventIndex").mockResolvedValue(undefined);

        render(<ConfirmTokenizerChangeDialog onFinished={onFinished} />);

        await userEvent.click(screen.getByRole("button", { name: "OK" }));
        await flushPromises();

        expect(EventIndexPeg.deleteEventIndex).toHaveBeenCalled();
        expect(onFinished).toHaveBeenCalledWith(true);
    });

    it("warns that substring search does not store messages securely encrypted", () => {
        render(<ConfirmTokenizerChangeDialog tokenizerMode={TokenizerMode.Substring} onFinished={vi.fn()} />);

        expect(screen.getByText(SUBSTRING_WARNING)).toBeInTheDocument();
    });

    it("does not show the warning for the other modes", () => {
        render(<ConfirmTokenizerChangeDialog tokenizerMode={TokenizerMode.Ngram} onFinished={vi.fn()} />);

        expect(screen.queryByText(SUBSTRING_WARNING)).not.toBeInTheDocument();
    });
});
