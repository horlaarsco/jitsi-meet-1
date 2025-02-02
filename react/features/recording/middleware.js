/* @flow */


import {
    createRecordingEvent,
    sendAnalytics
} from '../analytics';
import { APP_WILL_MOUNT, APP_WILL_UNMOUNT } from '../base/app';
import { CONFERENCE_JOIN_IN_PROGRESS, getCurrentConference } from '../base/conference';
import JitsiMeetJS, {
    JitsiConferenceEvents,
    JitsiRecordingConstants
} from '../base/lib-jitsi-meet';
import { MEDIA_TYPE } from '../base/media';
import { getParticipantDisplayName, updateLocalRecordingStatus } from '../base/participants';
import { MiddlewareRegistry, StateListenerRegistry } from '../base/redux';
import {
    playSound,
    registerSound,
    stopSound,
    unregisterSound
} from '../base/sounds';
import { TRACK_ADDED } from '../base/tracks';
import { sendMessage } from '../chat/actions.any';
import { NOTIFICATION_TIMEOUT_TYPE, showErrorNotification, showNotification } from '../notifications';

import { RECORDING_SESSION_UPDATED, START_LOCAL_RECORDING, STOP_LOCAL_RECORDING } from './actionTypes';
import {
    clearRecordingSessions,
    hidePendingRecordingNotification,
    showPendingRecordingNotification,
    showRecordingError,
    showRecordingLimitNotification,
    showRecordingWarning,
    showStartedRecordingNotification,
    showStoppedRecordingNotification,
    updateRecordingSessionData
} from './actions';
import LocalRecordingManager from './components/Recording/LocalRecordingManager';
import {
    LIVE_STREAMING_OFF_SOUND_ID,
    LIVE_STREAMING_ON_SOUND_ID,
    RECORDING_OFF_SOUND_ID,
    RECORDING_ON_SOUND_ID
} from './constants';
import {
    getSessionById,
    getResourceId
} from './functions';
import logger from './logger';
import {
    LIVE_STREAMING_OFF_SOUND_FILE,
    LIVE_STREAMING_ON_SOUND_FILE,
    RECORDING_OFF_SOUND_FILE,
    RECORDING_ON_SOUND_FILE
} from './sounds';

declare var APP: Object;
declare var interfaceConfig: Object;

/**
 * StateListenerRegistry provides a reliable way to detect the leaving of a
 * conference, where we need to clean up the recording sessions.
 */
StateListenerRegistry.register(
    /* selector */ state => getCurrentConference(state),
    /* listener */ (conference, { dispatch }) => {
        if (!conference) {
            dispatch(clearRecordingSessions());
        }
    }
);

/**
 * The redux middleware to handle the recorder updates in a React way.
 *
 * @param {Store} store - The redux store.
 * @returns {Function}
 */
MiddlewareRegistry.register(({ dispatch, getState }) => next => async action => {
    let oldSessionData;

    if (action.type === RECORDING_SESSION_UPDATED) {
        oldSessionData
            = getSessionById(getState(), action.sessionData.id);
    }

    const result = next(action);

    switch (action.type) {
    case APP_WILL_MOUNT:
        dispatch(registerSound(
            LIVE_STREAMING_OFF_SOUND_ID,
            LIVE_STREAMING_OFF_SOUND_FILE));

        dispatch(registerSound(
            LIVE_STREAMING_ON_SOUND_ID,
            LIVE_STREAMING_ON_SOUND_FILE));

        dispatch(registerSound(
            RECORDING_OFF_SOUND_ID,
            RECORDING_OFF_SOUND_FILE));

        dispatch(registerSound(
            RECORDING_ON_SOUND_ID,
            RECORDING_ON_SOUND_FILE));

        break;

    case APP_WILL_UNMOUNT:
        dispatch(unregisterSound(LIVE_STREAMING_OFF_SOUND_ID));
        dispatch(unregisterSound(LIVE_STREAMING_ON_SOUND_ID));
        dispatch(unregisterSound(RECORDING_OFF_SOUND_ID));
        dispatch(unregisterSound(RECORDING_ON_SOUND_ID));

        break;

    case CONFERENCE_JOIN_IN_PROGRESS: {
        const { conference } = action;

        conference.on(
            JitsiConferenceEvents.RECORDER_STATE_CHANGED,
            recorderSession => {
                if (recorderSession) {
                    recorderSession.getID() && dispatch(updateRecordingSessionData(recorderSession));
                    recorderSession.getError() && _showRecordingErrorNotification(recorderSession, dispatch);
                }

                return;
            });

        break;
    }

    case START_LOCAL_RECORDING: {
        const { onlySelf } = action;

        try {
            await LocalRecordingManager.startLocalRecording({ dispatch,
                getState }, action.onlySelf);
            const props = {
                descriptionKey: 'recording.on',
                titleKey: 'dialog.recording'
            };

            dispatch(playSound(RECORDING_ON_SOUND_ID));
            dispatch(sendMessage('Meeting is being recorded.'));
            dispatch(showNotification(props, NOTIFICATION_TIMEOUT_TYPE.MEDIUM));
            dispatch(showNotification({
                titleKey: 'recording.localRecordingStartWarningTitle',
                descriptionKey: 'recording.localRecordingStartWarning'
            }, NOTIFICATION_TIMEOUT_TYPE.STICKY));
            dispatch(updateLocalRecordingStatus(true, onlySelf));
            sendAnalytics(createRecordingEvent('started', `local${onlySelf ? '.self' : ''}`));
            if (typeof APP !== 'undefined') {
                APP.API.notifyRecordingStatusChanged(true, 'local');
            }
        } catch (err) {
            logger.error('Capture failed', err);

            let descriptionKey = 'recording.error';

            if (err.message === 'WrongSurfaceSelected') {
                descriptionKey = 'recording.surfaceError';

            } else if (err.message === 'NoLocalStreams') {
                descriptionKey = 'recording.noStreams';
            }
            const props = {
                descriptionKey,
                titleKey: 'recording.failedToStart'
            };

            if (typeof APP !== 'undefined') {
                APP.API.notifyRecordingStatusChanged(false, 'local', err.message);
            }

            dispatch(showErrorNotification(props, NOTIFICATION_TIMEOUT_TYPE.MEDIUM));
        }
        break;
    }

    case STOP_LOCAL_RECORDING: {
        const { localRecording } = getState()['features/base/config'];

        if (LocalRecordingManager.isRecordingLocally()) {
            LocalRecordingManager.stopLocalRecording();
            dispatch(updateLocalRecordingStatus(false));
            dispatch(sendMessage('Recording has ended'));
            if (localRecording?.notifyAllParticipants && !LocalRecordingManager.selfRecording) {
                dispatch(playSound(RECORDING_OFF_SOUND_ID));
            }
            if (typeof APP !== 'undefined') {
                APP.API.notifyRecordingStatusChanged(false, 'local');
            }
        }
        break;
    }

    case RECORDING_SESSION_UPDATED: {
        // When in recorder mode no notifications are shown
        // or extra sounds are also not desired
        // but we want to indicate those in case of sip gateway
        const {
            iAmRecorder,
            iAmSipGateway,
            recordingLimit
        } = getState()['features/base/config'];

        if (iAmRecorder && !iAmSipGateway) {
            break;
        }

        const updatedSessionData
            = getSessionById(getState(), action.sessionData.id);
        const { initiator, mode, terminator } = updatedSessionData;
        const { PENDING, OFF, ON } = JitsiRecordingConstants.status;

        if (updatedSessionData.status === PENDING
            && (!oldSessionData || oldSessionData.status !== PENDING)) {
            dispatch(showPendingRecordingNotification(mode));
        } else if (updatedSessionData.status !== PENDING) {
            dispatch(hidePendingRecordingNotification(mode));

            if (updatedSessionData.status === ON
                && (!oldSessionData || oldSessionData.status !== ON)) {
                if (typeof recordingLimit === 'object') {
                    // Show notification with additional information to the initiator.
                    dispatch(showRecordingLimitNotification(mode));
                } else {
                    dispatch(showStartedRecordingNotification(mode, initiator, action.sessionData.id));
                }

                sendAnalytics(createRecordingEvent('start', mode));

                let soundID;

                if (mode === JitsiRecordingConstants.mode.FILE) {
                    soundID = RECORDING_ON_SOUND_ID;
                } else if (mode === JitsiRecordingConstants.mode.STREAM) {
                    soundID = LIVE_STREAMING_ON_SOUND_ID;
                }

                if (soundID) {
                    dispatch(playSound(soundID));
                }

                if (typeof APP !== 'undefined') {
                    APP.API.notifyRecordingStatusChanged(true, mode);
                }
            } else if (updatedSessionData.status === OFF
                && (!oldSessionData || oldSessionData.status !== OFF)) {
                if (terminator) {
                    dispatch(
                        showStoppedRecordingNotification(
                            mode, getParticipantDisplayName(getState, getResourceId(terminator))));
                }

                let duration = 0, soundOff, soundOn;

                if (oldSessionData && oldSessionData.timestamp) {
                    duration
                        = (Date.now() / 1000) - oldSessionData.timestamp;
                }
                sendAnalytics(createRecordingEvent('stop', mode, duration));

                if (mode === JitsiRecordingConstants.mode.FILE) {
                    soundOff = RECORDING_OFF_SOUND_ID;
                    soundOn = RECORDING_ON_SOUND_ID;
                } else if (mode === JitsiRecordingConstants.mode.STREAM) {
                    soundOff = LIVE_STREAMING_OFF_SOUND_ID;
                    soundOn = LIVE_STREAMING_ON_SOUND_ID;
                }

                if (soundOff && soundOn) {
                    dispatch(stopSound(soundOn));
                    dispatch(playSound(soundOff));
                }

                if (typeof APP !== 'undefined') {
                    APP.API.notifyRecordingStatusChanged(false, mode);
                }
            }
        }

        break;
    }
    case TRACK_ADDED: {
        const { track } = action;

        if (LocalRecordingManager.isRecordingLocally() && track.mediaType === MEDIA_TYPE.AUDIO) {
            const audioTrack = track.jitsiTrack.track;

            LocalRecordingManager.addAudioTrackToLocalRecording(audioTrack);
        }
        break;
    }
    }

    return result;
});

/**
 * Shows a notification about an error in the recording session. A
 * default notification will display if no error is specified in the passed
 * in recording session.
 *
 * @private
 * @param {Object} recorderSession - The recorder session model from the
 * lib.
 * @param {Dispatch} dispatch - The Redux Dispatch function.
 * @returns {void}
 */
function _showRecordingErrorNotification(recorderSession, dispatch) {
    const mode = recorderSession.getMode();
    const error = recorderSession.getError();
    const isStreamMode = mode === JitsiMeetJS.constants.recording.mode.STREAM;

    switch (error) {
    case JitsiMeetJS.constants.recording.error.SERVICE_UNAVAILABLE:
        dispatch(showRecordingError({
            descriptionKey: 'recording.unavailable',
            descriptionArguments: {
                serviceName: isStreamMode
                    ? '$t(liveStreaming.serviceName)'
                    : '$t(recording.serviceName)'
            },
            titleKey: isStreamMode
                ? 'liveStreaming.unavailableTitle'
                : 'recording.unavailableTitle'
        }));
        break;
    case JitsiMeetJS.constants.recording.error.RESOURCE_CONSTRAINT:
        dispatch(showRecordingError({
            descriptionKey: isStreamMode
                ? 'liveStreaming.busy'
                : 'recording.busy',
            titleKey: isStreamMode
                ? 'liveStreaming.busyTitle'
                : 'recording.busyTitle'
        }));
        break;
    case JitsiMeetJS.constants.recording.error.UNEXPECTED_REQUEST:
        dispatch(showRecordingWarning({
            descriptionKey: isStreamMode
                ? 'liveStreaming.sessionAlreadyActive'
                : 'recording.sessionAlreadyActive',
            titleKey: isStreamMode ? 'liveStreaming.inProgress' : 'recording.inProgress'
        }));
        break;
    default:
        dispatch(showRecordingError({
            descriptionKey: isStreamMode
                ? 'liveStreaming.error'
                : 'recording.error',
            titleKey: isStreamMode
                ? 'liveStreaming.failedToStart'
                : 'recording.failedToStart'
        }));
        break;
    }

    if (typeof APP !== 'undefined') {
        APP.API.notifyRecordingStatusChanged(false, mode, error);
    }
}
