import {
  AppError,
  appendApiError,
  buildAudioMixState,
  createSessionMetrics,
  createTranslationViewState,
  elapsedStreamingMs,
  reduceTranslationEvent,
  type ErrorCode,
  type SessionMetrics,
  type TranslationViewState,
} from '@lilla/shared';
import { useMachine } from '@xstate/react';
import { useEffect, useRef, useState } from 'react';

import {
  captureAudio,
  describeCapture,
  isAbortError,
  stopStream,
  type AudioSourceKind,
} from '../audio/capture';
import { RemoteAudioPlayer, type PlaybackState } from '../audio/player';
import { MAX_RECONNECTS, sessionMachine, type SessionMachineEvent, type SessionPhase } from '../state/sessionMachine';
import { translationProvider, TranslationConnection } from '../translation/provider';

export type TranslationSession = {
  phase: SessionPhase;
  errorCode: string | null;
  errorMessage: string | null;
  technicalDetails: string | null;
  source: AudioSourceKind;
  setSource: (source: AudioSourceKind) => void;
  targetLanguage: string;
  setTargetLanguage: (language: string) => void;
  transcript: string;
  sourceTranscript: string;
  elapsedMs: number;
  inputStream: MediaStream | null;
  audioBlocked: boolean;
  resumeAudio: () => Promise<void>;
  mix: number;
  setMix: (mix: number) => void;
  volume: number;
  setVolume: (volume: number) => void;
  muted: boolean;
  setMuted: (muted: boolean) => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  captureLabel: string;
  connectionState: string;
  iceConnectionState: string;
  dataChannelState: string;
  lastEventType: string;
  playback: PlaybackState | 'idle';
  metrics: SessionMetrics;
};

export function useTranslationSession(options?: {
  onRemoteTrack?: (track: MediaStreamTrack | null) => void;
  initialTargetLanguage?: string;
}): TranslationSession {
  const [snapshot, send] = useMachine(sessionMachine);
  const [source, setSourceState] = useState<AudioSourceKind>('microphone');
  const [targetLanguage, setTargetLanguageState] = useState(options?.initialTargetLanguage ?? 'zh');
  const [transcript, setTranscript] = useState('');
  const [sourceTranscript, setSourceTranscript] = useState('');
  const [metrics, setMetrics] = useState<SessionMetrics>(() => createSessionMetrics({ targetLanguage: 'zh' }));
  const [elapsedMs, setElapsedMs] = useState(0);
  const [inputStream, setInputStream] = useState<MediaStream | null>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [mix, setMixState] = useState(85);
  const [volume, setVolumeState] = useState(1);
  const [muted, setMutedState] = useState(false);
  const [technicalDetails, setTechnicalDetails] = useState<string | null>(null);
  const [captureLabel, setCaptureLabel] = useState('idle');
  const [connectionState, setConnectionState] = useState('new');
  const [iceConnectionState, setIceConnectionState] = useState('new');
  const [dataChannelState, setDataChannelState] = useState('closed');
  const [lastEventType, setLastEventType] = useState('none');
  const [playback, setPlayback] = useState<PlaybackState | 'idle'>('idle');

  const sendRef = useRef(send);
  sendRef.current = send;
  const phaseRef = useRef<SessionPhase>(snapshot.value as SessionPhase);
  const runRef = useRef(0);
  const attemptsRef = useRef(0);
  const sourceRef = useRef(source);
  const languageRef = useRef(targetLanguage);
  const mixRef = useRef(mix);
  const volumeRef = useRef(volume);
  const mutedRef = useRef(muted);
  const streamRef = useRef<MediaStream | null>(null);
  const connectionRef = useRef<TranslationConnection | null>(null);
  const playerRef = useRef<RemoteAudioPlayer | null>(null);
  const metricsRef = useRef(metrics);
  const viewRef = useRef<TranslationViewState>(createTranslationViewState());
  const abortRef = useRef<AbortController | null>(null);
  const closingRef = useRef(false);
  const reconnectLock = useRef(false);
  const connectionToken = useRef<object | null>(null);
  const sessionOriginRef = useRef<number | null>(null);
  const disconnectTimer = useRef<number | null>(null);
  const onRemoteTrackRef = useRef(options?.onRemoteTrack);
  onRemoteTrackRef.current = options?.onRemoteTrack;

  useEffect(() => {
    phaseRef.current = snapshot.value as SessionPhase;
  }, [snapshot.value]);

  useEffect(() => {
    if (snapshot.value !== 'streaming' && snapshot.value !== 'reconnecting') {
      return;
    }
    const timer = window.setInterval(() => {
      setElapsedMs(elapsedStreamingMs(metricsRef.current, performance.now()));
    }, 250);
    return () => window.clearInterval(timer);
  }, [snapshot.value]);

  useEffect(() => {
    return () => {
      runRef.current += 1;
      abortRef.current?.abort();
      void cleanupMedia();
    };
  }, []);

  function patchMetrics(patch: Partial<SessionMetrics>) {
    metricsRef.current = { ...metricsRef.current, ...patch };
    setMetrics(metricsRef.current);
  }

  function transition(event: SessionMachineEvent, phase: SessionPhase) {
    sendRef.current(event);
    phaseRef.current = phase;
  }

  function clearDisconnectTimer() {
    if (disconnectTimer.current != null) {
      window.clearTimeout(disconnectTimer.current);
      disconnectTimer.current = null;
    }
  }

  async function cleanupMedia() {
    closingRef.current = true;
    clearDisconnectTimer();
    connectionToken.current = null;
    const connection = connectionRef.current;
    connectionRef.current = null;
    try {
      await connection?.close();
    } catch {
      /* already closed */
    }
    stopStream(streamRef.current);
    streamRef.current = null;
    setInputStream(null);
    setCaptureLabel('idle');
    playerRef.current?.release();
    onRemoteTrackRef.current?.(null);
    closingRef.current = false;
  }

  function applyLevels() {
    const connection = connectionRef.current;
    if (!connection) {
      return;
    }
    if (sourceRef.current === 'tab') {
      const levels = buildAudioMixState(mixRef.current);
      connection.setOriginalVolume(levels.originalVolume);
      connection.setTranslatedVolume(levels.translatedVolume);
    } else {
      connection.setOriginalVolume(0);
      connection.setTranslatedVolume(volumeRef.current);
    }
    connection.setTranslatedMuted(mutedRef.current);
  }

  async function failRun(myRun: number, code: ErrorCode, message: string, details?: string) {
    if (runRef.current !== myRun) {
      return;
    }
    runRef.current += 1;
    abortRef.current?.abort();
    setTechnicalDetails(details ?? null);
    transition({ type: 'FAIL', code, message }, 'error');
    await cleanupMedia();
    if (metricsRef.current.streamingStartedAt != null && metricsRef.current.streamingEndedAt == null) {
      patchMetrics({ streamingEndedAt: performance.now() });
    }
  }

  async function reconnect(myRun: number) {
    if (closingRef.current || reconnectLock.current || runRef.current !== myRun) {
      return;
    }
    if (phaseRef.current === 'connecting') {
      await failRun(myRun, 'webrtc_failed', 'WebRTC connection failed.');
      return;
    }
    if (phaseRef.current !== 'streaming') {
      return;
    }
    const stream = streamRef.current;
    if (!stream || stream.getAudioTracks().every((track) => track.readyState === 'ended')) {
      await failRun(myRun, 'track_ended', 'Input audio ended.');
      return;
    }
    if (attemptsRef.current >= MAX_RECONNECTS) {
      await failRun(myRun, 'reconnect_failed', 'The translation connection could not be restored.');
      return;
    }

    reconnectLock.current = true;
    attemptsRef.current += 1;
    transition({ type: 'INTERRUPT' }, 'reconnecting');
    patchMetrics({
      interruptions: metricsRef.current.interruptions + 1,
      reconnectionAttempts: attemptsRef.current,
    });
    try {
      closingRef.current = true;
      connectionToken.current = null;
      await connectionRef.current?.close({ keepPlayback: true });
      connectionRef.current = null;
      closingRef.current = false;
      await connectExisting(myRun);
    } catch (error) {
      if (runRef.current !== myRun || isAbortError(error)) {
        return;
      }
      const mapped = toAppError(error);
      await failRun(myRun, mapped.code, mapped.message, mapped.details);
    } finally {
      reconnectLock.current = false;
    }
  }

  function createListeners(myRun: number, token: object) {
    return {
      onSession: (info: { model: string | null; providerSessionId: string | null }) => {
        if (connectionToken.current !== token) {
          return;
        }
        patchMetrics({ model: info.model, providerSessionId: info.providerSessionId });
      },
      onEvent: (event: Parameters<typeof reduceTranslationEvent>[1]) => {
        if (connectionToken.current !== token) {
          return;
        }
        const next = reduceTranslationEvent(viewRef.current, event);
        viewRef.current = next;
        setTranscript(next.outputText);
        setSourceTranscript(next.inputText);
        setLastEventType(next.lastEventType);
        const origin = sessionOriginRef.current;
        const patch: Partial<SessionMetrics> = { transcriptDeltaCount: next.deltaCount };
        if (origin != null && next.deltaCount > 0 && metricsRef.current.firstTranscriptArrivalMs == null) {
          patch.firstTranscriptArrivalMs = performance.now() - origin;
        }
        if (origin != null && next.audioBufferStarted && metricsRef.current.firstOutputAudioEventMs == null) {
          patch.firstOutputAudioEventMs = performance.now() - origin;
        }
        if (next.errors.length > metricsRef.current.apiErrors.length) {
          const latest = next.errors[next.errors.length - 1] ?? 'Translation service error';
          patch.apiErrors = appendApiError(metricsRef.current.apiErrors, latest);
          setTechnicalDetails(latest);
        }
        patchMetrics(patch);
      },
      onRemoteStream: (stream: MediaStream) => {
        if (connectionToken.current !== token) {
          return;
        }
        const origin = sessionOriginRef.current;
        patchMetrics({
          remoteAudioTracks: metricsRef.current.remoteAudioTracks + 1,
          firstTranslatedAudioArrivalMs:
            metricsRef.current.firstTranslatedAudioArrivalMs ??
            (origin == null ? null : performance.now() - origin),
        });
        onRemoteTrackRef.current?.(stream.getAudioTracks()[0] ?? null);
      },
      onConnectionState: (state: RTCPeerConnectionState) => {
        if (connectionToken.current !== token) {
          return;
        }
        setConnectionState(state);
        if (closingRef.current || runRef.current !== myRun) {
          return;
        }
        if (state === 'connected' && sessionOriginRef.current != null && metricsRef.current.connectionSetupMs == null) {
          patchMetrics({ connectionSetupMs: performance.now() - sessionOriginRef.current });
        }
        if (state === 'connected') {
          clearDisconnectTimer();
        }
        if (state === 'failed') {
          void reconnect(myRun);
        }
        if (state === 'disconnected' && phaseRef.current === 'streaming') {
          clearDisconnectTimer();
          disconnectTimer.current = window.setTimeout(() => {
            void reconnect(myRun);
          }, 2000);
        }
      },
      onIceState: (state: RTCIceConnectionState) => {
        if (connectionToken.current === token) {
          setIceConnectionState(state);
        }
      },
      onDataChannelState: (state: RTCDataChannelState) => {
        if (connectionToken.current === token) {
          setDataChannelState(state);
        }
      },
      onPlayback: (state: PlaybackState) => {
        if (connectionToken.current !== token) {
          return;
        }
        setPlayback(state);
        setAudioBlocked(state === 'blocked');
      },
    };
  }

  async function connectExisting(myRun: number) {
    const stream = streamRef.current;
    if (!stream) {
      throw new AppError('unknown', 'Missing input audio.');
    }
    const token = {};
    connectionToken.current = token;
    if (sessionOriginRef.current == null) {
      sessionOriginRef.current = performance.now();
    }
    const connection = await translationProvider.connect({
      stream,
      targetLanguage: languageRef.current,
      inputProfile: sourceRef.current,
      playOriginal: false,
      translatedPlayer: playbackPlayer(),
      signal: abortRef.current?.signal,
      listeners: createListeners(myRun, token),
    });
    if (runRef.current !== myRun || connectionToken.current !== token) {
      await connection.close();
      return;
    }
    connectionRef.current = connection;
    applyLevels();
    transition({ type: 'CONNECTED' }, 'streaming');
    if (metricsRef.current.streamingStartedAt == null) {
      const now = performance.now();
      patchMetrics({ streamingStartedAt: now });
    }
    const playbackState = await connection.resumePlayback();
    setPlayback(playbackState);
    setAudioBlocked(playbackState === 'blocked');
  }

  function playbackPlayer(): RemoteAudioPlayer {
    if (!playerRef.current) {
      playerRef.current = new RemoteAudioPlayer();
    }
    return playerRef.current;
  }

  async function start() {
    const phase = phaseRef.current;
    if (phase !== 'idle' && phase !== 'stopped' && phase !== 'error') {
      return;
    }
    sourceRef.current = 'microphone';
    setSourceState('microphone');
    playbackPlayer().prime();
    const myRun = ++runRef.current;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    attemptsRef.current = 0;
    sessionOriginRef.current = null;
    viewRef.current = createTranslationViewState();
    setTranscript('');
    setSourceTranscript('');
    setAudioBlocked(false);
    setTechnicalDetails(null);
    setElapsedMs(0);
    setPlayback('idle');
    setConnectionState('new');
    const fresh = createSessionMetrics({ targetLanguage: languageRef.current });
    metricsRef.current = fresh;
    setMetrics(fresh);
    transition(phase === 'error' ? { type: 'RETRY' } : { type: 'START' }, 'requestingPermission');

    try {
      const stream = await captureAudio(sourceRef.current);
      if (runRef.current !== myRun) {
        stopStream(stream);
        return;
      }
      streamRef.current = stream;
      setInputStream(stream);
      setCaptureLabel(describeCapture(stream));
      for (const track of stream.getAudioTracks()) {
        track.addEventListener('ended', () => {
          if (closingRef.current || runRef.current !== myRun) {
            return;
          }
          void failRun(myRun, 'track_ended', 'Input audio ended.');
        });
      }
      transition({ type: 'PERMISSION_GRANTED' }, 'connecting');
      await connectExisting(myRun);
    } catch (error) {
      if (runRef.current !== myRun || isAbortError(error)) {
        return;
      }
      const mapped = toAppError(error);
      await failRun(myRun, mapped.code, mapped.message, mapped.details ?? mapped.message);
    }
  }

  async function stop() {
    const phase = phaseRef.current;
    if (phase === 'idle' || phase === 'stopped' || phase === 'error' || phase === 'stopping') {
      return;
    }
    runRef.current += 1;
    abortRef.current?.abort();
    transition({ type: 'STOP' }, 'stopping');
    await cleanupMedia();
    const now = performance.now();
    if (metricsRef.current.streamingStartedAt != null) {
      patchMetrics({ streamingEndedAt: now });
      setElapsedMs(elapsedStreamingMs({ ...metricsRef.current, streamingEndedAt: now }, now));
    }
    transition({ type: 'STOPPED' }, 'stopped');
  }

  return {
    phase: snapshot.value as SessionPhase,
    errorCode: snapshot.context.errorCode,
    errorMessage: snapshot.context.errorMessage,
    technicalDetails,
    source,
    setSource: (next) => {
      sourceRef.current = next;
      setSourceState(next);
    },
    targetLanguage,
    setTargetLanguage: (next) => {
      languageRef.current = next;
      setTargetLanguageState(next);
    },
    transcript,
    sourceTranscript,
    elapsedMs,
    inputStream,
    audioBlocked,
    resumeAudio: async () => {
      const state = await connectionRef.current?.resumePlayback();
      if (state) {
        setPlayback(state);
        setAudioBlocked(state === 'blocked');
      }
    },
    mix,
    setMix: (next) => {
      mixRef.current = next;
      setMixState(next);
      applyLevels();
    },
    volume,
    setVolume: (next) => {
      volumeRef.current = next;
      setVolumeState(next);
      applyLevels();
    },
    muted,
    setMuted: (next) => {
      mutedRef.current = next;
      setMutedState(next);
      applyLevels();
    },
    start,
    stop,
    captureLabel,
    connectionState,
    iceConnectionState,
    dataChannelState,
    lastEventType,
    playback,
    metrics,
  };
}

function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  const message = error instanceof Error ? error.message : 'Unexpected translation error.';
  return new AppError('unknown', message);
}
