import { clampVolume } from '@lilla/shared';

export type PlaybackState = 'playing' | 'blocked';

const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=';

type AudioSessionNavigator = Navigator & {
  audioSession?: { type: string };
};

/** Ask the browser to treat capture and playback as one conversation. */
export function preferPlayAndRecord(): void {
  const session = (navigator as AudioSessionNavigator).audioSession;
  if (!session) {
    return;
  }
  try {
    session.type = 'play-and-record';
  } catch {
    /* This browser does not accept the value. */
  }
}

/**
 * Plays translated audio through the system output route.
 * Call prime() inside the start tap so iPhone Safari keeps this element unlocked.
 */
export class RemoteAudioPlayer {
  private audio: HTMLAudioElement | null = null;
  private volume = 1;
  private muted = false;

  prime(): void {
    preferPlayAndRecord();
    const audio = this.ensure();
    if (!audio.srcObject) {
      audio.src = SILENT_WAV;
    }
    void audio.play().catch(() => undefined);
  }

  attach(stream: MediaStream): Promise<PlaybackState> {
    const audio = this.ensure();
    audio.pause();
    audio.srcObject = null;
    audio.removeAttribute('src');
    audio.srcObject = stream;
    this.apply();
    return this.resume();
  }

  setVolume(volume: number): void {
    this.volume = clampVolume(volume);
    this.apply();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.apply();
  }

  async resume(): Promise<PlaybackState> {
    if (!this.audio) {
      return 'blocked';
    }
    try {
      await this.audio.play();
      return 'playing';
    } catch {
      return 'blocked';
    }
  }

  /** Drop the current stream and keep the unlocked element for the next track. */
  detach(): void {
    if (!this.audio) {
      return;
    }
    this.audio.pause();
    this.audio.srcObject = null;
    this.audio.removeAttribute('src');
  }

  release(): void {
    if (!this.audio) {
      return;
    }
    this.detach();
    this.audio.remove();
    this.audio = null;
  }

  private ensure(): HTMLAudioElement {
    if (this.audio) {
      return this.audio;
    }
    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.setAttribute('playsinline', 'true');
    audio.setAttribute('webkit-playsinline', 'true');
    audio.preload = 'auto';
    audio.style.display = 'none';
    document.body.append(audio);
    this.audio = audio;
    this.apply();
    return audio;
  }

  private apply(): void {
    if (!this.audio) {
      return;
    }
    this.audio.volume = this.volume;
    this.audio.muted = this.muted;
  }
}
