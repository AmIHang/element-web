/*
 * Copyright 2026 Element Creations Ltd.
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE files in the repository root for full details.
 */

import React, { type JSX, type KeyboardEvent } from "react";
import { Button, InlineSpinner, Text } from "@vector-im/compound-web";
import AiIcon from "@vector-im/compound-design-tokens/assets/web/icons/ai";

import styles from "./MessagePromptView.module.css";
import { type ViewModel, useViewModel } from "../../../core/viewmodel";
import { Flex } from "../../../core/utils/Flex";
import { useI18n } from "../../../core/i18n/i18nContext";

/**
 * Why the message could not be written.
 * - `not_connected`: no AI provider is connected in the agent settings.
 * - `rate_limited`: the provider asks to slow down.
 * - `refused`: the model declined to write the message.
 * - `unavailable`: the provider could not be reached.
 * - `unknown`: anything else.
 */
export type MessagePromptError = "not_connected" | "rate_limited" | "refused" | "unavailable" | "unknown";

export interface MessagePromptViewSnapshot {
    /**
     * The instruction of the user for the message, such as "tell Phillip to finally fix the bugs".
     */
    prompt: string;
    /**
     * Whether the message is being written. The controls are disabled meanwhile.
     */
    isGenerating: boolean;
    /**
     * Why the last attempt failed, if it did.
     */
    error?: MessagePromptError;
}

export interface MessagePromptViewActions {
    /**
     * Called when the user changes the instruction.
     */
    setPrompt: (prompt: string) => void;
    /**
     * Called when the user asks for the message to be written.
     */
    submit: () => void;
    /**
     * Called when the user gives up.
     */
    cancel: () => void;
}

/**
 * The view model for {@link MessagePromptView}.
 */
export type MessagePromptViewModel = ViewModel<MessagePromptViewSnapshot, MessagePromptViewActions>;

interface MessagePromptViewProps {
    /**
     * The view model for the prompt.
     */
    vm: MessagePromptViewModel;
}

/** The longest instruction that can be typed, as the platform accepts no longer ones */
export const MAX_PROMPT_LENGTH = 2000;

/** The text for an error; written out per error so that the strings can be found for translation */
function getErrorText(_t: ReturnType<typeof useI18n>["translate"], error: MessagePromptError): string {
    switch (error) {
        case "not_connected":
            return _t("composer|message_prompt|error_not_connected");
        case "rate_limited":
            return _t("composer|message_prompt|error_rate_limited");
        case "refused":
            return _t("composer|message_prompt|error_refused");
        case "unavailable":
            return _t("composer|message_prompt|error_unavailable");
        case "unknown":
            return _t("composer|message_prompt|error_unknown");
    }
}

/**
 * A field to describe a message in a few words, which the agent then writes out and puts into the composer.
 * Enter writes the message, Shift+Enter starts a new line.
 *
 * @example
 * ```tsx
 * <MessagePromptView vm={messagePromptViewModel} />
 * ```
 */
export function MessagePromptView({ vm }: Readonly<MessagePromptViewProps>): JSX.Element {
    const { translate: _t } = useI18n();
    const { prompt, isGenerating, error } = useViewModel(vm);
    const canSubmit = !isGenerating && prompt.trim().length > 0;

    const onKeyDown = (ev: KeyboardEvent<HTMLTextAreaElement>): void => {
        if (ev.key !== "Enter" || ev.shiftKey || ev.nativeEvent.isComposing) return;
        ev.preventDefault();
        if (canSubmit) vm.submit();
    };

    return (
        <Flex direction="column" align="stretch" gap="var(--cpd-space-3x)" className={styles.view}>
            <label className={styles.label} htmlFor="mx_MessagePrompt_text">
                {_t("composer|message_prompt|label")}
            </label>
            <Text size="sm" className={styles.description}>
                {_t("composer|message_prompt|description")}
            </Text>
            <textarea
                id="mx_MessagePrompt_text"
                className={styles.control}
                rows={4}
                maxLength={MAX_PROMPT_LENGTH}
                value={prompt}
                disabled={isGenerating}
                placeholder={_t("composer|message_prompt|placeholder")}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "mx_MessagePrompt_error" : undefined}
                onChange={(ev) => vm.setPrompt(ev.currentTarget.value)}
                onKeyDown={onKeyDown}
                // The prompt is opened to type the instruction right away
                autoFocus
            />
            {error && (
                <Text size="sm" id="mx_MessagePrompt_error" className={styles.error} role="alert">
                    {getErrorText(_t, error)}
                </Text>
            )}
            <Flex justify="end" gap="var(--cpd-space-2x)">
                <Button kind="secondary" size="md" onClick={() => vm.cancel()}>
                    {_t("action|cancel")}
                </Button>
                <Button
                    kind="primary"
                    size="md"
                    Icon={isGenerating ? InlineSpinner : AiIcon}
                    disabled={!canSubmit}
                    onClick={() => vm.submit()}
                >
                    {isGenerating ? _t("composer|message_prompt|generating") : _t("composer|message_prompt|submit")}
                </Button>
            </Flex>
        </Flex>
    );
}
