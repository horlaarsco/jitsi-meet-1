// @flow

import jwtEncode from 'jwt-encode';
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
    const meetjwt = '22fb1ee4b1a20e32bf67ee773c1f27fdf6605732';

    const data = {
        context: {
            user: {
                avatar: '',
                name: '',
                email: '',
                moderator: false,
                affiliation: 'owner'
            },
            features: {
                livestreaming: 'true',
                'outbound-call': 'true',
                transcription: 'true',
                recording: 'true'
            },
            group: '*'
        },
        iss: 'jitsi-16855',
        aud: 'jitsi',
        room: '*',
        sub: new URL(url).hostname
    };


    const jwt = jwtEncode(data, meetjwt);

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
