/*
Copyright 2026 Hiroshi Shinaoka

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React from "react";

import BaseDialog from "../../../../components/views/dialogs/BaseDialog";
import Spinner from "../../../../components/views/elements/Spinner";
import DialogButtons from "../../../../components/views/elements/DialogButtons";
import { _t } from "../../../../languageHandler";
import EventIndexPeg from "../../../../indexing/EventIndexPeg";
import { TokenizerMode } from "../../../../settings/enums/TokenizerMode";

interface IProps {
    /** The tokenizer mode the user is switching to. */
    tokenizerMode?: TokenizerMode;
    onFinished: (confirmed?: boolean) => void;
}

interface IState {
    deleting: boolean;
}

/*
 * Confirmation dialog for deleting the database when tokenizer mode is changed.
 */
export default class ConfirmTokenizerChangeDialog extends React.Component<IProps, IState> {
    public constructor(props: IProps) {
        super(props);
        this.state = {
            deleting: false,
        };
    }

    private readonly onConfirm = async (): Promise<void> => {
        this.setState({
            deleting: true,
        });

        await EventIndexPeg.deleteEventIndex();
        this.props.onFinished(true);
    };

    public render(): React.ReactNode {
        return (
            <BaseDialog onFinished={this.props.onFinished} title={_t("common|are_you_sure")}>
                <p>{_t("settings|security|tokenizer_mode_change_warning")}</p>
                {this.props.tokenizerMode === TokenizerMode.Substring && (
                    // The substring index keeps fragments of the message text unencrypted on disk.
                    <p className="text-warning">
                        {_t("settings|security|tokenizer_mode_substring_warning")}
                    </p>
                )}
                {this.state.deleting ? <Spinner /> : <div />}
                <DialogButtons
                    primaryButton={_t("action|ok")}
                    onPrimaryButtonClick={this.onConfirm}
                    primaryButtonClass="danger"
                    cancelButtonClass="warning"
                    onCancel={this.props.onFinished}
                    disabled={this.state.deleting}
                />
            </BaseDialog>
        );
    }
}
