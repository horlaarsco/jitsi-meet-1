// @flow

import React from 'react';

import CopyButton from '../../../../base/buttons/CopyButton';
import { translate } from '../../../../base/i18n';
import { getDecodedURI } from '../../../../base/util';


type Props = {

    /**
     * Invoked to obtain translated strings.
     */
    t: Function,

    /**
     * The URL of the conference.
     */
    url: string
};

/**
 * Component meant to enable users to copy the conference URL.
 *
 * @returns {React$Element<any>}
 */
function CopyMeetingLinkSection({ t, url }: Props) {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjb250ZXh0Ijp7InVzZXIiOnsiYXZhdGFyIjoiIiwibmFtZSI6IiIsImVtYWlsIjoiIiwibW9kZXJhdG9yIjpmYWxzZSwiYWZmaWxpYXRpb24iOiJvd25lciJ9LCJmZWF0dXJlcyI6eyJsaXZlc3RyZWFtaW5nIjoidHJ1ZSIsIm91dGJvdW5kLWNhbGwiOiJ0cnVlIiwidHJhbnNjcmlwdGlvbiI6InRydWUiLCJyZWNvcmRpbmciOiJ0cnVlIn0sImdyb3VwIjoiKiJ9LCJpc3MiOiJqaXRzaS0xNjg1NSIsImF1ZCI6ImppdHNpIiwicm9vbSI6IioiLCJzdWIiOiJtZWV0LmphdmF0MzY1LmNvbSIsImlhdCI6MTY2NzQ2ODE4NSwiZXhwIjo0NzkxNjcwNTg1fQ.Fx235S6Skq5tRAarV748Vse1-b4oV5zJhaaJYy9Pl3A';

    return (
        <>
            <label htmlFor = { 'copy-button-id' }>{t('addPeople.shareLink')}</label>
            <CopyButton
                aria-label = { t('addPeople.copyLink') }
                className = 'invite-more-dialog-conference-url'
                displayedText = { `${getDecodedURI(url)}?jwt=${jwt}` }
                id = 'copy-button-id'
                textOnCopySuccess = { t('addPeople.linkCopied') }
                textOnHover = { t('addPeople.copyLink') }
                textToCopy = { `${url}?jwt=${jwt}` } />
        </>
    );
}

export default translate(CopyMeetingLinkSection);
