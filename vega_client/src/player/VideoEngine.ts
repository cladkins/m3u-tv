import { VideoPlayer } from '@amazon-devices/react-native-w3cmedia';
export type EngineEvent = 'timeupdate' | 'playing' | 'pause' | 'waiting' | 'ended' | 'error' | 'loadedmetadata';

let shakaModule: any = null;

// Shaka and Amazon's polyfills (generated into src/vendor by
// scripts/setup-shaka.sh) load on the first HLS stream, not at app start, so
// a problem in them can only break HLS playback. The polyfills go in before
// Shaka itself is evaluated, since Shaka probes browser globals on load.
function loadShaka(): any {
  if (shakaModule) return shakaModule;
  const polyfills = [
    require('../vendor/shaka/polyfills/DocumentPolyfill'),
    require('../vendor/shaka/polyfills/ElementPolyfill'),
    require('../vendor/shaka/polyfills/TextDecoderPolyfill'),
    require('../vendor/shaka/polyfills/W3CMediaPolyfill'),
    require('../vendor/shaka/polyfills/MiscPolyfill'),
    require('../vendor/shaka/polyfills/DOMParserPolyfill'),
  ];
  for (const polyfill of polyfills) (polyfill.default ?? polyfill).install();
  const loaded = require('../vendor/shaka/dist/shaka-player.compiled');
  const shaka = loaded.default ?? loaded;
  shaka.polyfill.installAll();
  // Shaka's XHR plugin needs browser APIs Vega lacks; route HTTP through fetch.
  for (const scheme of ['http', 'https']) {
    shaka.net.NetworkingEngine.unregisterScheme(scheme);
    shaka.net.NetworkingEngine.registerScheme(
      scheme,
      shaka.net.HttpFetchPlugin.parse,
      shaka.net.NetworkingEngine.PluginPriority.APPLICATION,
      true,
    );
  }
  shakaModule = shaka;
  return shaka;
}

// HLS (live channels, and any .m3u8 VOD) needs MSE through Shaka. Flat files
// (mp4, mkv, ts) play in the platform's URL mode, which handles them natively.
export function needsAdaptivePlayer(url: string): boolean {
  const path = url.split('?')[0].toLowerCase();
  return path.endsWith('.m3u8') || path.endsWith('.mpd');
}

export class VideoEngine {
  readonly video = new VideoPlayer();
  private shakaPlayer: any = null;
  private surfaceHandle: string | null = null;
  private captionHandle: string | null = null;
  private initialized = false;
  private loaded = false;
  private destroyed = false;
  private listeners: Array<[EngineEvent, () => void]> = [];
  private lastError: string | undefined;
  private started = false;

  async open(url: string, startPosition?: number): Promise<void> {
    await this.video.initialize();
    this.initialized = true;
    if (this.destroyed) {
      await this.video.deinitialize();
      return;
    }
    for (const [event, listener] of this.listeners) this.video.addEventListener(event, listener);
    this.video.autoplay = false;
    const adaptive = needsAdaptivePlayer(url);
    console.log(`M3UTV player: opening ${redact(url)} via ${adaptive ? 'Shaka (MSE)' : 'URL mode'}`);

    if (adaptive) {
      const shaka = loadShaka();
      this.shakaPlayer = new shaka.Player(this.video);
      this.shakaPlayer.configure({
        streaming: {
          bufferingGoal: 10,
          rebufferingGoal: 2,
          lowLatencyMode: false,
          retryParameters: { maxAttempts: 4, baseDelay: 500, backoffFactor: 2 },
        },
        manifest: {
          hls: { sequenceMode: true },
          retryParameters: { maxAttempts: 4, baseDelay: 500, backoffFactor: 2 },
        },
        abr: { enabled: true },
      });
      this.shakaPlayer.addEventListener('error', (event: { detail?: unknown }) => {
        this.lastError = describeError(event?.detail);
        console.warn(`M3UTV player: Shaka error: ${this.lastError}`);
        this.emit('error');
      });
      // Like Amazon's samples, the surface is attached and play() called while
      // Shaka is still loading: on Vega the pipeline needs the surface before
      // the first segments decode, so waiting on load() first can stall.
      const loading = this.shakaPlayer.load(url, startPosition && startPosition > 0 ? startPosition : undefined);
      this.loaded = true;
      this.startIfReady();
      try {
        await loading;
      } catch (e) {
        this.lastError = describeError(e);
        throw new Error(this.lastError);
      }
      console.log('M3UTV player: Shaka manifest loaded');
    } else {
      this.video.src = url;
      if (startPosition && startPosition > 0) {
        const seekOnce = () => {
          this.video.removeEventListener('loadedmetadata', seekOnce);
          this.video.currentTime = startPosition;
        };
        this.video.addEventListener('loadedmetadata', seekOnce);
      }
      this.loaded = true;
      this.startIfReady();
    }
  }

  on(event: EngineEvent, listener: () => void) {
    this.listeners.push([event, listener]);
    if (this.loaded) this.video.addEventListener(event, listener);
  }

  private emit(event: EngineEvent) {
    for (const [name, listener] of this.listeners) if (name === event) listener();
  }

  attachSurface(handle: string) {
    this.surfaceHandle = handle;
    this.startIfReady();
  }

  detachSurface(handle: string) {
    if (this.surfaceHandle === handle) this.surfaceHandle = null;
    try {
      this.video.clearSurfaceHandle(handle);
    } catch {
      // Already released.
    }
  }

  attachCaptions(handle: string) {
    this.captionHandle = handle;
    if (this.loaded) this.video.setCaptionViewHandle(handle);
  }

  private startIfReady() {
    if (this.started || !this.loaded || !this.surfaceHandle || this.destroyed) return;
    this.started = true;
    this.video.setSurfaceHandle(this.surfaceHandle);
    if (this.captionHandle) this.video.setCaptionViewHandle(this.captionHandle);
    this.video.play().catch((e: unknown) => {
      console.warn(`M3UTV player: play() rejected: ${describeError(e)}`);
    });
  }

  get currentTime(): number {
    return this.loaded ? this.video.currentTime || 0 : 0;
  }

  get duration(): number {
    const d = this.loaded ? this.video.duration : 0;
    return Number.isFinite(d) && d > 0 ? d : 0;
  }

  get paused(): boolean {
    return this.loaded ? this.video.paused : true;
  }

  get errorMessage(): string | undefined {
    if (this.lastError) return this.lastError;
    try {
      const err = this.video.error as unknown as { message?: string; code?: number } | null;
      if (!err) return undefined;
      const text = err.message || (err.code ? `Media error ${err.code}` : undefined);
      if (text) console.warn(`M3UTV player: media element error: ${text}`);
      return text;
    } catch {
      return undefined;
    }
  }

  togglePlay() {
    if (!this.loaded) return;
    if (this.video.paused) this.video.play().catch(() => undefined);
    else this.video.pause();
  }

  play() {
    if (this.loaded) this.video.play().catch(() => undefined);
  }

  pause() {
    if (this.loaded) this.video.pause();
  }

  seekTo(seconds: number) {
    if (!this.loaded) return;
    const max = this.duration > 0 ? this.duration - 1 : seconds;
    this.video.currentTime = Math.max(0, Math.min(seconds, max));
  }

  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    try {
      if (this.initialized) this.video.pause();
    } catch {
      // ignore
    }
    for (const [event, listener] of this.listeners) {
      try {
        this.video.removeEventListener(event, listener);
      } catch {
        // ignore
      }
    }
    if (this.shakaPlayer) {
      try {
        await this.shakaPlayer.detach();
        await this.shakaPlayer.destroy();
      } catch {
        // ignore
      }
      this.shakaPlayer = null;
    }
    if (this.surfaceHandle) this.detachSurface(this.surfaceHandle);
    if (this.captionHandle) {
      try {
        this.video.clearCaptionViewHandle(this.captionHandle);
      } catch {
        // ignore
      }
    }
    if (this.initialized) {
      try {
        await this.video.deinitialize();
      } catch {
        // ignore
      }
    }
  }
}

function redact(url: string): string {
  return url.replace(/\/(live|movie|series)\/[^/]+\/[^/]+\//, '/$1/<user>/<pass>/');
}

const SHAKA_CODES: Record<number, string> = {
  1001: 'the server returned an HTTP error',
  1002: 'the stream could not be reached',
  1003: 'the stream request timed out',
  3014: 'the decoder rejected a segment',
  3015: 'the decoder failed to append a segment',
  3016: 'the video element reported a decode error',
  4000: 'the playlist could not be parsed',
  4032: 'no playable variants were found',
  4036: 'the stream uses an unsupported container',
  7000: 'loading was interrupted',
};

// Shaka rejects with shaka.util.Error, which has a numeric code and a data
// array instead of a message; turn it into something worth showing.
export function describeError(error: unknown): string {
  if (!error) return 'Unknown error';
  const e = error as { code?: number; category?: number; data?: unknown[]; message?: string };
  if (typeof e.code === 'number' && Array.isArray(e.data)) {
    const reason = SHAKA_CODES[e.code] ?? `category ${e.category}`;
    const status = e.code === 1001 && e.data[1] ? ` (HTTP ${e.data[1]})` : '';
    return `Shaka error ${e.code}: ${reason}${status}`;
  }
  if (e.message) return e.message;
  return String(error);
}
