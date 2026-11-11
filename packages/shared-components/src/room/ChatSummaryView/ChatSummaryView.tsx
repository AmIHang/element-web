/*
 * Copyright 2026 Element Creations Ltd.
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE files in the repository root for full details.
 */

import React, { type JSX } from "react";
import { Button, InlineSpinner, Text } from "@vector-im/compound-web";
import { RestartIcon } from "@vector-im/compound-design-tokens/assets/web/icons";

import styles from "./ChatSummaryView.module.css";
import { type ViewModel, useViewModel } from "../../core/viewmodel";
import { Flex } from "../../core/utils/Flex";
import { useI18n } from "../../core/i18n/i18nContext";

/**
 * Why no summary could be written.
 * - `not_connected`: no AI provider is connected in the agent settings.
 * - `no_messages`: the chat has no messages with text to summarise.
 * - `failed`: the provider failed or declined.
 */
export type ChatSummaryError = "not_connected" | "no_messages" | "failed";

export interface ChatSummaryViewSnapshot {
    /** Whether the summary is being written */
    loading: boolean;
    /**
     * The summary: plain text lines, the points starting with "- ". Empty while there is none.
     */
    summary: string;
    /** How many messages the summary covers */
    messageCount: number;
    /** Why the last attempt failed, if it did */
    error?: ChatSummaryError;
}

export interface ChatSummaryViewActions {
    /** Write the summary again, for the messages as they are now */
    refresh: () => void;
    /** Open the agent settings, to connect a provider */
    openSettings: () => void;
}

/**
 * The view model of {@link ChatSummaryView}.
 */
export type ChatSummaryViewModel = ViewModel<ChatSummaryViewSnapshot, ChatSummaryViewActions>;

interface ChatSummaryViewProps {
    /** The view model of the summary */
    vm: ChatSummaryViewModel;
}

/**
 * A line of the summary: a point of a list, or a heading above the points that follow. The key is the number of
 * the line in the summary, which stays the same for as long as the summary does.
 */
type SummaryLine = { kind: "point" | "heading"; text: string; key: string };

/** Split the summary into points and headings, grouping consecutive points into one list */
function parseSummary(summary: string): SummaryLine[][] {
    const groups: SummaryLine[][] = [];
    for (const [index, raw] of summary.split("\n").entries()) {
        const line = raw.trim();
        if (!line) continue;
        const key = String(index);
        const point = /^(?:[-*•]|\d+[.)])\s+(.*)$/u.exec(line);
        const entry: SummaryLine = point
            ? { kind: "point", text: point[1], key }
            : // Models sometimes add Markdown heading or bold markers despite being asked not to
              { kind: "heading", text: line.replace(/^#+\s*/u, "").replace(/^\*\*(.*)\*\*$/u, "$1"), key };
        const last = groups.at(-1);
        if (entry.kind === "point" && last?.[0].kind === "point") last.push(entry);
        else groups.push([entry]);
    }
    return groups;
}

/**
 * A summary of the latest messages of a chat, written by the agent, so that the user gets a quick overview of what
 * happened while they were away, including what the agent answered for them.
 *
 * @example
 * ```tsx
 * <ChatSummaryView vm={chatSummaryViewModel} />
 * ```
 */
export function ChatSummaryView({ vm }: Readonly<ChatSummaryViewProps>): JSX.Element {
    const { translate: _t } = useI18n();
    const { loading, summary, messageCount, error } = useViewModel(vm);

    let content: JSX.Element;
    if (loading) {
        content = (
            <Flex align="center" gap="var(--cpd-space-2x)" className={styles.status}>
                <InlineSpinner />
                <Text size="md">{_t("room|chat_summary|loading", { count: messageCount })}</Text>
            </Flex>
        );
    } else if (error) {
        content = (
            <Text size="md" className={styles.error} role="alert">
                {error === "not_connected"
                    ? _t("room|chat_summary|error_not_connected")
                    : error === "no_messages"
                      ? _t("room|chat_summary|error_no_messages")
                      : _t("room|chat_summary|error_failed")}
            </Text>
        );
    } else {
        content = (
            <div className={styles.summary}>
                <Text size="sm" className={styles.caption}>
                    {_t("room|chat_summary|caption", { count: messageCount })}
                </Text>
                {parseSummary(summary).map((group) =>
                    group[0].kind === "point" ? (
                        <ul key={group[0].key} className={styles.points}>
                            {group.map((line) => (
                                <li key={line.key}>{line.text}</li>
                            ))}
                        </ul>
                    ) : (
                        <Text key={group[0].key} as="p" size="md" weight="semibold" className={styles.heading}>
                            {group[0].text}
                        </Text>
                    ),
                )}
            </div>
        );
    }

    return (
        <Flex direction="column" align="stretch" gap="var(--cpd-space-4x)" className={styles.view} aria-busy={loading}>
            {content}
            <Flex justify="end" gap="var(--cpd-space-2x)">
                {error === "not_connected" ? (
                    <Button kind="primary" size="md" onClick={() => vm.openSettings()}>
                        {_t("room|chat_summary|open_settings")}
                    </Button>
                ) : (
                    <Button
                        kind="secondary"
                        size="md"
                        Icon={RestartIcon}
                        disabled={loading || error === "no_messages"}
                        onClick={() => vm.refresh()}
                    >
                        {_t("room|chat_summary|refresh")}
                    </Button>
                )}
            </Flex>
        </Flex>
    );
}
