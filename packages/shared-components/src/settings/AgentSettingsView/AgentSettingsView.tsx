/*
 * Copyright 2026 Element Creations Ltd.
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE files in the repository root for full details.
 */

import React, { type JSX, useEffect, useState } from "react";
import {
    Button,
    Field,
    HelpMessage,
    InlineField,
    Label,
    PasswordControl,
    RadioControl,
    Root,
    Submit,
    Text,
    ToggleControl,
} from "@vector-im/compound-web";

import { useViewModel, type ViewModel } from "../../core/viewmodel";
import { useI18n } from "../../core/i18n/i18nContext";
import { Flex } from "../../core/utils/Flex";
import styles from "./AgentSettingsView.module.css";

/**
 * The AI providers the agent can use: Claude with an Anthropic account or API key, or GitHub Copilot with a GitHub
 * account.
 */
export type AgentSettingsProvider = "claude" | "copilot";

/**
 * How Copilot is connected.
 * - `account`: with the GitHub account Copilot is signed in to on this computer.
 * - `token`: with a GitHub token.
 */
export type AgentSettingsCopilotAuth = "account" | "token";

/**
 * The GitHub account Copilot is signed in to on this computer.
 */
export interface AgentSettingsCopilotAccount {
    /** Whether Copilot is signed in to an account on this computer */
    signedIn: boolean;
    /** The GitHub login of the account, if known */
    login?: string;
}

/**
 * How Claude is connected.
 * - `account`: with the Anthropic account the Anthropic CLI is signed in to on this computer.
 * - `key`: with an Anthropic API key.
 */
export type AgentSettingsClaudeAuth = "account" | "key";

/**
 * The Anthropic account the Anthropic CLI is signed in to on this computer.
 */
export interface AgentSettingsClaudeAccount {
    /** Whether the Anthropic CLI is signed in to an account on this computer */
    signedIn: boolean;
    /** The email address of the account, if known */
    email?: string;
    /** The name of the organization the account uses, if known */
    organization?: string;
    /** The ID of the workspace the sign-in is bound to, if known */
    workspace?: string;
    /** Whether the Anthropic CLI, which signing in needs, is installed; undefined if not known */
    cliInstalled?: boolean;
}

/**
 * Why the last action failed.
 * - `invalid_credential`: the provider rejected the key or token.
 * - `rate_limited`: the provider asks to slow down, or the plan's allowance is used up.
 * - `unavailable`: the provider could not be reached.
 * - `missing_cli`: signing in to Anthropic needs the Anthropic CLI, which is not installed.
 * - `unknown`: anything else.
 */
export type AgentSettingsError = "invalid_credential" | "rate_limited" | "unavailable" | "missing_cli" | "unknown";

/**
 * A model the selected provider offers.
 */
export interface AgentSettingsModel {
    id: string;
    /** Name for display */
    name: string;
}

export interface AgentSettingsViewSnapshot {
    /** Whether the settings are still being read */
    isLoading: boolean;
    /** Whether an action is in progress, during which the controls are disabled */
    isBusy: boolean;
    /** The provider that writes the replies */
    provider: AgentSettingsProvider;
    /** Whether each provider is connected */
    connected: Record<AgentSettingsProvider, boolean>;
    /** How Copilot is connected, if it is */
    copilotAuth?: AgentSettingsCopilotAuth;
    /** The GitHub account Copilot is signed in to on this computer, once it is known */
    copilotAccount?: AgentSettingsCopilotAccount;
    /** How Claude is connected, if it is */
    claudeAuth?: AgentSettingsClaudeAuth;
    /** The Anthropic account the Anthropic CLI is signed in to on this computer, once it is known */
    claudeAccount?: AgentSettingsClaudeAccount;
    /** Whether the user is signing in to the selected provider in the browser */
    isSigningIn: boolean;
    /** The models of the selected provider; empty while it is not connected */
    models: AgentSettingsModel[];
    /** The selected model, or undefined for the provider's default */
    model?: string;
    /** The user's own instructions for the agent */
    instructions: string;
    /** Whether replies are suggested above the composer of every chat */
    replySuggestions: boolean;
    /** Why the last action failed, if it did */
    error?: AgentSettingsError;
}

export interface AgentSettingsViewActions {
    /** Choose the provider that writes the replies */
    setProvider: (provider: AgentSettingsProvider) => void;
    /** Connect the selected provider with an API key or token */
    connect: (credential: string) => void;
    /** Connect Copilot with the GitHub account it is signed in to on this computer */
    connectCopilotAccount: () => void;
    /** Sign in to GitHub in the browser and connect Copilot with that account */
    signInCopilot: () => void;
    /** Stop signing in to GitHub */
    cancelCopilotSignIn: () => void;
    /** Connect Claude with the Anthropic account the Anthropic CLI is signed in to on this computer */
    connectClaudeAccount: () => void;
    /** Sign in to Anthropic in the browser with the Anthropic CLI and connect Claude with that account */
    signInClaude: () => void;
    /** Stop signing in to Anthropic */
    cancelClaudeSignIn: () => void;
    /** Disconnect the selected provider */
    disconnect: () => void;
    /** Choose a model of the selected provider, or "" for its default */
    setModel: (model: string) => void;
    /** Save the user's own instructions */
    saveInstructions: (instructions: string) => void;
    /** Turn the reply suggestions on or off */
    setReplySuggestions: (enabled: boolean) => void;
}

/**
 * The view model of {@link AgentSettingsView}.
 */
export type AgentSettingsViewModel = ViewModel<AgentSettingsViewSnapshot, AgentSettingsViewActions>;

export interface AgentSettingsViewProps {
    /** The view model of the agent settings */
    vm: AgentSettingsViewModel;
}

interface AccountControlsProps {
    /** Whether the user is signing in in the browser */
    isSigningIn: boolean;
    /** Whether an action is in progress */
    isBusy: boolean;
    /** What to show while signing in */
    signingInText: string;
    /** What to show about the account the computer is signed in to, or undefined if it isn't */
    signedInText?: string;
    /** What to show before signing in */
    signInDescription: string;
    /** The label of the button that signs in */
    signInLabel: string;
    /** The label of the button that uses the account the computer is signed in to */
    useAccountLabel: string;
    onUseAccount: () => void;
    onSignIn: () => void;
    onCancel: () => void;
}

/**
 * The controls to connect a provider with the account of the computer: use it if it is signed in, sign in in the
 * browser if not, and cancel while signing in.
 */
function AccountControls(props: Readonly<AccountControlsProps>): JSX.Element {
    const { translate: _t } = useI18n();
    let text: string;
    let button: JSX.Element;
    if (props.isSigningIn) {
        text = props.signingInText;
        button = (
            <Button kind="secondary" size="md" onClick={props.onCancel}>
                {_t("action|cancel")}
            </Button>
        );
    } else if (props.signedInText) {
        text = props.signedInText;
        button = (
            <Button kind="primary" size="md" disabled={props.isBusy} onClick={props.onUseAccount}>
                {props.useAccountLabel}
            </Button>
        );
    } else {
        text = props.signInDescription;
        button = (
            <Button kind="primary" size="md" disabled={props.isBusy} onClick={props.onSignIn}>
                {props.signInLabel}
            </Button>
        );
    }
    return (
        <Flex align="center" justify="space-between" gap="var(--cpd-space-4x)">
            <Text size="md">{text}</Text>
            {button}
        </Flex>
    );
}

/**
 * Settings of the agent that replies to the direct messages set to "Agent": which AI provider it uses, how the
 * provider is connected, the model, the user's own instructions and whether it suggests replies in every chat.
 * Claude can be connected with the Anthropic account the Anthropic CLI is signed in to on this computer, by signing
 * in in the browser, or with an API key. Copilot can be connected with the GitHub account it is signed in to on this
 * computer, by signing in in the browser, or with a GitHub token.
 */
export function AgentSettingsView({ vm }: Readonly<AgentSettingsViewProps>): JSX.Element {
    const { translate: _t } = useI18n();
    const {
        isLoading,
        isBusy,
        isSigningIn,
        provider,
        connected,
        copilotAuth,
        copilotAccount,
        claudeAuth,
        claudeAccount,
        models,
        model,
        instructions,
        replySuggestions,
        error,
    } = useViewModel(vm);
    const [credential, setCredential] = useState("");
    const [instructionsDraft, setInstructionsDraft] = useState(instructions);

    // Show the saved instructions once they are loaded
    useEffect(() => setInstructionsDraft(instructions), [instructions]);
    // A credential typed for one provider is never sent to the other
    useEffect(() => setCredential(""), [provider]);

    if (isLoading) return <Text>{_t("common|loading")}</Text>;

    const isConnected = connected[provider];
    // The keys are written out so that the translation tooling finds them
    const providerNames: Record<AgentSettingsProvider, string> = {
        claude: _t("settings|agent|provider_claude"),
        copilot: _t("settings|agent|provider_copilot"),
    };
    const connectedLabels: Record<AgentSettingsProvider, string> = {
        claude: _t("settings|agent|connected_claude"),
        copilot: _t("settings|agent|connected_copilot"),
    };
    const credentialLabels: Record<AgentSettingsProvider, string> = {
        claude: _t("settings|agent|credential_claude"),
        copilot: _t("settings|agent|credential_copilot"),
    };
    const credentialHelp: Record<AgentSettingsProvider, string> = {
        claude: _t("settings|agent|credential_help_claude"),
        copilot: _t("settings|agent|credential_help_copilot"),
    };
    const errorMessages: Record<AgentSettingsError, string> = {
        invalid_credential: _t("settings|agent|error_invalid_credential"),
        rate_limited: _t("settings|agent|error_rate_limited"),
        unavailable: _t("settings|agent|error_unavailable"),
        missing_cli: _t("settings|agent|error_missing_cli"),
        unknown: _t("settings|agent|error_unknown"),
    };
    const errorMessage = error && errorMessages[error];
    const { email, organization } = claudeAccount ?? {};
    const claudeAccountName =
        email && organization
            ? _t("settings|agent|claude_account_name", { email, organization })
            : (email ?? organization);
    let connectedLabel = connectedLabels[provider];
    if (provider === "copilot" && copilotAuth === "account" && copilotAccount?.login) {
        connectedLabel = _t("settings|agent|connected_copilot_account", { login: copilotAccount.login });
    } else if (provider === "claude" && claudeAuth === "account" && claudeAccountName) {
        connectedLabel = _t("settings|agent|connected_claude_account", { account: claudeAccountName });
    }

    // The workspace is shown for the account of the computer only, not for an API key
    const claudeWorkspace =
        claudeAccount?.signedIn && claudeAccount.workspace && (!isConnected || claudeAuth === "account") ? (
            <Text size="sm" className={styles.description}>
                {_t("settings|agent|claude_workspace", { workspace: claudeAccount.workspace })}
            </Text>
        ) : undefined;
    // Without the CLI, signing in can't work, which is said before the user tries
    const claudeSignInDescription =
        claudeAccount?.cliInstalled === false
            ? _t("settings|agent|claude_cli_missing")
            : _t("settings|agent|claude_sign_in_description");

    // What the account of the computer is signed in to, or undefined if it isn't
    let claudeSignedInText: string | undefined;
    if (claudeAccount?.signedIn) {
        claudeSignedInText = claudeAccountName
            ? _t("settings|agent|claude_signed_in_as", { account: claudeAccountName })
            : _t("settings|agent|claude_signed_in");
    }
    let copilotSignedInText: string | undefined;
    if (copilotAccount?.signedIn) {
        copilotSignedInText = copilotAccount.login
            ? _t("settings|agent|copilot_signed_in_as", { login: copilotAccount.login })
            : _t("settings|agent|copilot_signed_in");
    }

    const tokenForm = (
        <Root
            onSubmit={(ev) => {
                ev.preventDefault();
                if (credential.trim()) vm.connect(credential.trim());
            }}
        >
            <Field name="credential">
                <Label>{credentialLabels[provider]}</Label>
                <PasswordControl
                    value={credential}
                    disabled={isBusy}
                    autoComplete="off"
                    onChange={(ev) => setCredential(ev.currentTarget.value)}
                />
                <HelpMessage>{credentialHelp[provider]}</HelpMessage>
            </Field>
            <Submit size="md" disabled={isBusy || !credential.trim()}>
                {_t("settings|agent|connect")}
            </Submit>
        </Root>
    );

    return (
        <Flex direction="column" gap="var(--cpd-space-6x)" className={styles.agentSettings}>
            <Text size="sm" className={styles.description}>
                {_t("settings|agent|description")}
            </Text>

            <Root onSubmit={(ev) => ev.preventDefault()}>
                <Text as="h3" size="md" weight="semibold">
                    {_t("settings|agent|provider")}
                </Text>
                {(["claude", "copilot"] as const).map((option) => (
                    <InlineField
                        key={option}
                        name="provider"
                        control={
                            <RadioControl
                                value={option}
                                checked={provider === option}
                                disabled={isBusy}
                                onChange={() => vm.setProvider(option)}
                            />
                        }
                    >
                        <Label>{providerNames[option]}</Label>
                    </InlineField>
                ))}
            </Root>

            {isConnected && (
                <Flex align="center" justify="space-between" gap="var(--cpd-space-4x)">
                    <Text size="md">{connectedLabel}</Text>
                    <Button kind="secondary" size="md" disabled={isBusy} onClick={vm.disconnect}>
                        {_t("settings|agent|disconnect")}
                    </Button>
                </Flex>
            )}
            {isConnected && provider === "claude" && claudeWorkspace}

            {!isConnected && (
                <Flex direction="column" gap="var(--cpd-space-6x)">
                    {provider === "claude" ? (
                        <Flex direction="column" gap="var(--cpd-space-3x)">
                            <Text as="h3" size="md" weight="semibold">
                                {_t("settings|agent|claude_account")}
                            </Text>
                            <AccountControls
                                isSigningIn={isSigningIn}
                                isBusy={isBusy}
                                signingInText={_t("settings|agent|claude_signing_in")}
                                signedInText={claudeSignedInText}
                                signInDescription={claudeSignInDescription}
                                signInLabel={_t("settings|agent|claude_sign_in")}
                                useAccountLabel={_t("settings|agent|claude_use_account")}
                                onUseAccount={vm.connectClaudeAccount}
                                onSignIn={vm.signInClaude}
                                onCancel={vm.cancelClaudeSignIn}
                            />
                            {claudeWorkspace}
                            <Text size="sm" className={styles.description}>
                                {_t("settings|agent|claude_account_help")}
                            </Text>
                        </Flex>
                    ) : (
                        <Flex direction="column" gap="var(--cpd-space-3x)">
                            <Text as="h3" size="md" weight="semibold">
                                {_t("settings|agent|copilot_account")}
                            </Text>
                            <AccountControls
                                isSigningIn={isSigningIn}
                                isBusy={isBusy}
                                signingInText={_t("settings|agent|copilot_signing_in")}
                                signedInText={copilotSignedInText}
                                signInDescription={_t("settings|agent|copilot_sign_in_description")}
                                signInLabel={_t("settings|agent|copilot_sign_in")}
                                useAccountLabel={_t("settings|agent|copilot_use_account")}
                                onUseAccount={vm.connectCopilotAccount}
                                onSignIn={vm.signInCopilot}
                                onCancel={vm.cancelCopilotSignIn}
                            />
                            <Text size="sm" className={styles.description}>
                                {_t("settings|agent|copilot_account_help")}
                            </Text>
                        </Flex>
                    )}
                    <Flex direction="column" gap="var(--cpd-space-3x)">
                        <Text as="h3" size="md" weight="semibold">
                            {provider === "claude"
                                ? _t("settings|agent|claude_key")
                                : _t("settings|agent|copilot_token")}
                        </Text>
                        {tokenForm}
                    </Flex>
                    {/* Shown once below both ways of connecting, since it can come from either */}
                    {errorMessage && (
                        <Text size="sm" className={styles.error}>
                            {errorMessage}
                        </Text>
                    )}
                </Flex>
            )}

            {isConnected && (
                <Flex direction="column" gap="var(--cpd-space-2x)">
                    <label className={styles.label} htmlFor="mx_AgentSettings_model">
                        {_t("settings|agent|model")}
                    </label>
                    <select
                        id="mx_AgentSettings_model"
                        className={styles.control}
                        value={model ?? ""}
                        disabled={isBusy}
                        onChange={(ev) => vm.setModel(ev.currentTarget.value)}
                    >
                        <option value="">{_t("settings|agent|model_default")}</option>
                        {models.map(({ id, name }) => (
                            <option key={id} value={id}>
                                {name}
                            </option>
                        ))}
                    </select>
                    {errorMessage && (
                        <Text size="sm" className={styles.error}>
                            {errorMessage}
                        </Text>
                    )}
                </Flex>
            )}

            <Root onSubmit={(ev) => ev.preventDefault()}>
                <InlineField
                    name="replySuggestions"
                    control={
                        <ToggleControl
                            checked={replySuggestions}
                            disabled={isBusy}
                            onChange={(ev) => vm.setReplySuggestions(ev.currentTarget.checked)}
                        />
                    }
                >
                    <Label>{_t("settings|agent|reply_suggestions")}</Label>
                    <HelpMessage>{_t("settings|agent|reply_suggestions_description")}</HelpMessage>
                </InlineField>
            </Root>

            <Flex direction="column" gap="var(--cpd-space-2x)">
                <label className={styles.label} htmlFor="mx_AgentSettings_instructions">
                    {_t("settings|agent|instructions")}
                </label>
                <textarea
                    id="mx_AgentSettings_instructions"
                    className={styles.control}
                    rows={5}
                    value={instructionsDraft}
                    disabled={isBusy}
                    placeholder={_t("settings|agent|instructions_placeholder")}
                    onChange={(ev) => setInstructionsDraft(ev.currentTarget.value)}
                />
                <Flex justify="end">
                    <Button
                        kind="primary"
                        size="md"
                        disabled={isBusy || instructionsDraft === instructions}
                        onClick={() => vm.saveInstructions(instructionsDraft)}
                    >
                        {_t("action|save")}
                    </Button>
                </Flex>
            </Flex>
        </Flex>
    );
}
