import { SUPPORTED_TARGET_LANGUAGES, languageLabel } from '@lilla/shared';
import { useState } from 'react';

import { useTranslationSession } from './hooks/useTranslationSession';
import type { SessionPhase } from './state/sessionMachine';

const LANGUAGE_KEY = 'ltl.targetLanguage';

function readTargetLanguage(): string {
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY);
    if (saved && SUPPORTED_TARGET_LANGUAGES.some((language) => language.code === saved)) {
      return saved;
    }
  } catch {
    /* Private browsing can block storage. */
  }
  return 'zh';
}

function statusLine(phase: SessionPhase): string | null {
  if (phase === 'requestingPermission' || phase === 'connecting') {
    return '正在连接…';
  }
  if (phase === 'streaming') {
    return '正在聆听并翻译…';
  }
  if (phase === 'reconnecting') {
    return '正在重新连接…';
  }
  if (phase === 'stopping') {
    return '正在结束…';
  }
  if (phase === 'error') {
    return '连接失败';
  }
  return null;
}

function friendlyError(code: string | null): string {
  switch (code) {
    case 'missing_api_key':
      return '翻译服务还没有配置密钥。';
    case 'invalid_api_key':
      return '密钥无效，请检查服务器上的配置。';
    case 'mic_denied':
      return '需要麦克风权限。请在浏览器里允许后重试。';
    case 'mic_not_found':
      return '没有找到可用的麦克风。';
    case 'unsupported_browser':
      return '请用手机上的 Safari 或 Chrome 打开。';
    case 'rate_limited':
      return '请求太频繁，请稍后再试。';
    case 'network':
      return '连不上翻译服务。请确认电脑上的应用仍在运行。';
    case 'reconnect_failed':
      return '连接中断了。再按一次开始即可。';
    case 'track_ended':
      return '麦克风已停止。';
    case 'webrtc_failed':
      return '语音通道没有连上。';
    default:
      return '请再试一次。';
  }
}

function isLive(phase: SessionPhase): boolean {
  return (
    phase === 'requestingPermission' ||
    phase === 'connecting' ||
    phase === 'streaming' ||
    phase === 'reconnecting' ||
    phase === 'stopping'
  );
}

export function InterpreterScreen() {
  const session = useTranslationSession({ initialTargetLanguage: readTargetLanguage() });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [secure] = useState(() => window.isSecureContext);
  const live = isLive(session.phase);
  const listening = session.phase === 'streaming' || session.phase === 'reconnecting';
  const status = statusLine(session.phase);

  function chooseLanguage(code: string) {
    session.setTargetLanguage(code);
    try {
      localStorage.setItem(LANGUAGE_KEY, code);
    } catch {
      /* Ignore storage failures. */
    }
  }

  return (
    <main className="stage">
      <header className="head">
        <div>
          <h1>Lilla Tolken Live</h1>
          <p>实时课堂翻译</p>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="设置"
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen((open) => !open)}
        >
          <GearIcon />
        </button>
      </header>

      {settingsOpen ? (
        <section className="sheet" aria-label="语言">
          <label htmlFor="target-language">翻译成</label>
          <select
            id="target-language"
            value={session.targetLanguage}
            disabled={live}
            onChange={(event) => chooseLanguage(event.target.value)}
          >
            {SUPPORTED_TARGET_LANGUAGES.map((language) => (
              <option key={language.code} value={language.code}>
                {language.label}
              </option>
            ))}
          </select>
          <p>课堂上的语言会自动识别。</p>
        </section>
      ) : null}

      <section className="hero">
        <div className={listening ? 'orb live' : 'orb'} aria-hidden="true">
          <MicIcon />
        </div>
        <p className="languages">Auto → {languageLabel(session.targetLanguage)}</p>
        <p className="status" role="status" aria-live="polite">
          {status}
        </p>
        {session.phase === 'error' ? <p className="hint warn">{friendlyError(session.errorCode)}</p> : null}
        {!secure ? <p className="hint warn">手机麦克风需要用 HTTPS 打开这个页面。</p> : null}

        <button
          type="button"
          className={live ? 'go stop' : 'go'}
          disabled={session.phase === 'stopping'}
          onClick={() => {
            if (live) {
              void session.stop();
              return;
            }
            void session.start();
          }}
        >
          {live ? '结束翻译' : '开始实时翻译'}
        </button>

        {session.audioBlocked ? (
          <button type="button" className="text-button" onClick={() => void session.resumeAudio()}>
            点一下播放译文
          </button>
        ) : null}

        <p className="hint">戴耳机收听最合适。也可以直接用手机扬声器试听。</p>
      </section>

      <details className="fold">
        <summary>译文</summary>
        <p className="transcript">{session.transcript || '还没有译文。'}</p>
      </details>

      <details className="fold quiet">
        <summary>诊断</summary>
        <dl>
          <div>
            <dt>状态</dt>
            <dd>{session.phase}</dd>
          </div>
          <div>
            <dt>连接</dt>
            <dd>{session.connectionState}</dd>
          </div>
          <div>
            <dt>ICE</dt>
            <dd>{session.iceConnectionState}</dd>
          </div>
          <div>
            <dt>数据通道</dt>
            <dd>{session.dataChannelState}</dd>
          </div>
          <div>
            <dt>麦克风</dt>
            <dd>{session.captureLabel}</dd>
          </div>
          <div>
            <dt>最近事件</dt>
            <dd>{session.lastEventType}</dd>
          </div>
          {session.technicalDetails ? (
            <div>
              <dt>详情</dt>
              <dd>{session.technicalDetails}</dd>
            </div>
          ) : null}
        </dl>
      </details>
    </main>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 80 80" width="86" height="86">
      <rect x="28" y="12" width="24" height="36" rx="12" fill="#3B82F6" />
      <path
        d="M22 36v4c0 10 7.2 18 18 18s18-8 18-18v-4"
        fill="none"
        stroke="#1D4ED8"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path d="M40 58v8M30 68h20" fill="none" stroke="#1D4ED8" strokeWidth="4" strokeLinecap="round" />
      <path d="M58 18c6 6 8 14 8 22" fill="none" stroke="#93C5FD" strokeWidth="3" strokeLinecap="round" />
      <path d="M62 12c8 8 11 18 11 28" fill="none" stroke="#BFDBFE" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 8.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 0 0 12 8.5Zm8.2 2.6-.9-.2a7.4 7.4 0 0 0-.7-1.6l.5-.8a1 1 0 0 0-.2-1.3l-.9-.9a1 1 0 0 0-1.3-.2l-.8.5a7.4 7.4 0 0 0-1.6-.7l-.2-.9a1 1 0 0 0-1-.8h-1.2a1 1 0 0 0-1 .8l-.2.9a7.4 7.4 0 0 0-1.6.7l-.8-.5a1 1 0 0 0-1.3.2l-.9.9a1 1 0 0 0-.2 1.3l.5.8c-.3.5-.5 1-.7 1.6l-.9.2a1 1 0 0 0-.8 1v1.2a1 1 0 0 0 .8 1l.9.2c.2.6.4 1.1.7 1.6l-.5.8a1 1 0 0 0 .2 1.3l.9.9a1 1 0 0 0 1.3.2l.8-.5c.5.3 1 .5 1.6.7l.2.9a1 1 0 0 0 1 .8h1.2a1 1 0 0 0 1-.8l.2-.9c.6-.2 1.1-.4 1.6-.7l.8.5a1 1 0 0 0 1.3-.2l.9-.9a1 1 0 0 0 .2-1.3l-.5-.8c.3-.5.5-1 .7-1.6l.9-.2a1 1 0 0 0 .8-1v-1.2a1 1 0 0 0-.8-1Z"
      />
    </svg>
  );
}
