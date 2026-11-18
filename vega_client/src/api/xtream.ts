import {
  AuthResponse,
  Category,
  Credentials,
  EpgListing,
  Favorite,
  FavoriteContentType,
  LiveStream,
  PlayableType,
  Programme,
  Progress,
  ProgressUpdate,
  Series,
  SeriesInfo,
  Viewer,
  VodInfo,
  VodStream,
} from './types';
import { decodeBase64WhenApplicable, randomHex, toNumber } from '../utils/text';

const CLIENT_HEADER = 'X-M3UE-Client';
const CLIENT_VALUE = 'm3u-tv';
const AUTH_TIMEOUT_MS = 30_000;
const REQUEST_TIMEOUT_MS = 60_000;
const EPG_BATCH_MAX = 100;

export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

export function normalizeServerUrl(raw: string): string {
  let url = raw.trim().replace(/\/+$/, '');
  if (url && !/^https?:\/\//i.test(url)) url = `http://${url}`;
  return url;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ApiError(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function errorMessageFrom(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const record = body as Record<string, unknown>;
  for (const key of ['error', 'message', 'detail', 'error_code']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return undefined;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object') return Object.values(value) as T[];
  return [];
}

function toProgrammes(listings: unknown): Programme[] {
  const raw = Array.isArray(listings)
    ? listings
    : listings && typeof listings === 'object'
      ? asArray<EpgListing>(
          (listings as Record<string, unknown>).epg_listings ??
            (listings as Record<string, unknown>).listings ??
            (listings as Record<string, unknown>).programmes,
        )
      : [];
  const programmes: Programme[] = [];
  for (const item of raw as EpgListing[]) {
    const start = parseEpgTime(item.start_timestamp ?? item.start);
    const end = parseEpgTime(item.stop_timestamp ?? item.end);
    if (!start || !end || end <= start) continue;
    programmes.push({
      title: decodeBase64WhenApplicable(String(item.title ?? '')),
      description: decodeBase64WhenApplicable(String(item.description ?? '')),
      start,
      end,
    });
  }
  programmes.sort((a, b) => a.start - b.start);
  return programmes;
}

// Returns epoch seconds. Accepts epoch seconds/ms or "YYYY-MM-DD HH:MM:SS" (UTC).
function parseEpgTime(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = toNumber(value);
  if (n !== undefined) return n > 1e12 ? Math.floor(n / 1000) : n;
  const text = String(value).trim();
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(text) ? `${text.replace(' ', 'T')}Z` : text;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined;
}

function localDateString(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export class XtreamClient {
  readonly credentials: Credentials;
  private readonly sessionId = `m3utv-${randomHex(16)}`;

  constructor(credentials: Credentials) {
    this.credentials = { ...credentials, server: normalizeServerUrl(credentials.server) };
  }

  private apiUrl(action?: string, params?: Record<string, string | number | undefined>): string {
    const { server, username, password } = this.credentials;
    const base = /\/player_api\.php$/i.test(server) ? server : `${server}/player_api.php`;
    const query = [`username=${encodeURIComponent(username)}`, `password=${encodeURIComponent(password)}`];
    if (action) query.push(`action=${encodeURIComponent(action)}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== '') {
          query.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
        }
      }
    }
    return `${base}?${query.join('&')}`;
  }

  private async request<T>(
    action: string | undefined,
    options: {
      params?: Record<string, string | number | undefined>;
      body?: Record<string, unknown>;
      timeoutMs?: number;
    } = {},
  ): Promise<T> {
    const url = this.apiUrl(action, options.params);
    const headers: Record<string, string> = { Accept: 'application/json', [CLIENT_HEADER]: CLIENT_VALUE };
    let body: string | undefined;
    if (options.body) {
      headers['Content-Type'] = 'application/json';
      const stringified: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(options.body)) {
        if (value === undefined || value === null) continue;
        stringified[key] = typeof value === 'object' ? value : String(value);
      }
      body = JSON.stringify(stringified);
    }
    const response = await withTimeout(
      fetch(url, { method: options.body ? 'POST' : 'GET', headers, body }),
      options.timeoutMs ?? REQUEST_TIMEOUT_MS,
      'The server took too long to respond.',
    );
    const data = await readJson(response);
    if (response.status >= 400) {
      throw new ApiError(errorMessageFrom(data) ?? `HTTP ${response.status}`, response.status);
    }
    return data as T;
  }

  async authenticate(): Promise<AuthResponse> {
    const data = await this.request<AuthResponse>(undefined, { timeoutMs: AUTH_TIMEOUT_MS });
    if (!data || typeof data !== 'object') {
      throw new ApiError('The server returned an unexpected response.');
    }
    if (data.error) throw new ApiError(String(data.error));
    if (!data.user_info || Number(data.user_info.auth) !== 1) {
      const reason = data.user_info?.status || data.user_info?.message;
      throw new ApiError(reason ? `Sign-in failed: ${reason}` : 'Sign-in failed. Check the username and password.');
    }
    if (!data.m3u_editor || typeof data.m3u_editor !== 'object') {
      throw new ApiError('This app requires an m3u-editor backend.');
    }
    return data;
  }

  getLiveCategories(): Promise<Category[]> {
    return this.request<unknown>('get_live_categories').then(asArray<Category>);
  }

  getVodCategories(): Promise<Category[]> {
    return this.request<unknown>('get_vod_categories').then(asArray<Category>);
  }

  getSeriesCategories(): Promise<Category[]> {
    return this.request<unknown>('get_series_categories').then(asArray<Category>);
  }

  getLiveStreams(categoryId?: string): Promise<LiveStream[]> {
    return this.request<unknown>('get_live_streams', { params: { category_id: categoryId } }).then(
      asArray<LiveStream>,
    );
  }

  getVodStreams(categoryId?: string): Promise<VodStream[]> {
    return this.request<unknown>('get_vod_streams', { params: { category_id: categoryId } }).then(
      asArray<VodStream>,
    );
  }

  getSeries(categoryId?: string): Promise<Series[]> {
    return this.request<unknown>('get_series', { params: { category_id: categoryId } }).then(asArray<Series>);
  }

  getVodInfo(vodId: number): Promise<VodInfo> {
    return this.request<VodInfo>('get_vod_info', { params: { vod_id: vodId } });
  }

  getSeriesInfo(seriesId: number): Promise<SeriesInfo> {
    return this.request<SeriesInfo>('get_series_info', { params: { series_id: seriesId } });
  }

  async getShortEpg(streamId: number, limit = 4): Promise<Programme[]> {
    const data = await this.request<unknown>('get_short_epg', { params: { stream_id: streamId, limit } });
    return toProgrammes(data);
  }

  // The editor returns `date` and `date + 1` for each call, so asking for
  // yesterday covers anything that started before midnight and is still on.
  async getEpgBatch(streamIds: number[], days: Date[]): Promise<Map<number, Programme[]>> {
    const result = new Map<number, Programme[]>();
    for (let i = 0; i < streamIds.length; i += EPG_BATCH_MAX) {
      const chunk = streamIds.slice(i, i + EPG_BATCH_MAX);
      const responses = await Promise.all(
        days.map((day) =>
          this.request<Record<string, unknown>>('get_epg_batch', {
            params: { stream_ids: chunk.join(','), limit: 48, details: 1, date: localDateString(day) },
          }).catch(() => ({}) as Record<string, unknown>),
        ),
      );
      for (const id of chunk) {
        const seen = new Set<number>();
        const merged: Programme[] = [];
        for (const response of responses) {
          for (const p of toProgrammes(response?.[String(id)])) {
            if (!seen.has(p.start)) {
              seen.add(p.start);
              merged.push(p);
            }
          }
        }
        merged.sort((a, b) => a.start - b.start);
        result.set(id, merged);
      }
    }
    return result;
  }

  getViewers(): Promise<Viewer[]> {
    return this.request<unknown>('get_viewers').then(asArray<Viewer>);
  }

  async getRecentlyWatched(viewerId: string, limit = 20): Promise<Progress[]> {
    const data = await this.request<unknown>('get_recently_watched', {
      params: { viewer_id: viewerId, limit, include_up_next: 1 },
    });
    return asArray<Progress>(data);
  }

  async getProgress(viewerId: string, contentType: 'vod' | 'episode', streamId: number): Promise<Progress | null> {
    const data = await this.request<Progress | null>('get_progress', {
      params: { viewer_id: viewerId, content_type: contentType, stream_id: streamId },
    });
    return data && typeof data === 'object' && 'stream_id' in data ? data : null;
  }

  async getSeriesProgress(viewerId: string, seriesId: number): Promise<Progress[]> {
    const data = await this.request<unknown>('get_series_progress', {
      params: { viewer_id: viewerId, series_id: seriesId },
    });
    return asArray<Progress>(data);
  }

  async updateProgress(viewerId: string, update: ProgressUpdate): Promise<void> {
    await this.request<unknown>('update_progress', { body: { viewer_id: viewerId, ...update } });
  }

  async getFavorites(viewerId: string): Promise<Favorite[]> {
    const data = await this.request<unknown>('get_favorites', { params: { viewer_id: viewerId } });
    return asArray<Favorite>(data);
  }

  async toggleFavorite(
    viewerId: string,
    contentType: FavoriteContentType,
    streamId: number,
    favorited: boolean,
  ): Promise<void> {
    await this.request<unknown>('toggle_favorite', {
      body: { viewer_id: viewerId, content_type: contentType, stream_id: streamId, favorited },
    });
  }

  liveUrl(streamId: number): string {
    return this.playbackUrl('live', streamId, 'm3u8');
  }

  movieUrl(streamId: number, extension?: string): string {
    return this.playbackUrl('movie', streamId, extension || 'mp4');
  }

  episodeUrl(episodeId: number | string, extension?: string): string {
    return this.playbackUrl('series', episodeId, extension || 'mp4');
  }

  urlFor(type: PlayableType, streamId: number, extension?: string): string {
    if (type === 'live') return this.liveUrl(streamId);
    if (type === 'vod') return this.movieUrl(streamId, extension);
    return this.episodeUrl(streamId, extension);
  }

  // Credentials go into the path unencoded, matching the Xtream URL scheme the
  // editor serves. client_id lets the editor tie the stream to this session so
  // stopStream() can release the connection slot right away.
  //
  // proxy=true&player=true routes the stream through the editor's In-App
  // Player profile, as the Flutter web build does: Vega plays through MSE like
  // a browser, so it needs the editor's browser-compatible output (HLS or a
  // remux) rather than the provider's raw stream meant for VLC or Kodi.
  private playbackUrl(kind: 'live' | 'movie' | 'series', id: number | string, extension: string): string {
    const { server, username, password } = this.credentials;
    const base = server.replace(/\/player_api\.php$/i, '');
    return `${base}/${kind}/${username}/${password}/${id}.${extension}?proxy=true&player=true&client_id=${this.sessionId}`;
  }

  async stopStream(type: PlayableType, streamId: number): Promise<void> {
    const { server, username, password } = this.credentials;
    const base = server.replace(/\/player_api\.php$/i, '');
    const url = `${base}/api/tv/${encodeURIComponent(username)}/${encodeURIComponent(password)}/player-stream/stop`;
    const body: Record<string, unknown> = {
      type: type === 'episode' ? 'series' : type,
      client_id: this.sessionId,
    };
    if (type === 'episode') body.episode_id = streamId;
    else body.stream_id = streamId;
    try {
      await withTimeout(
        fetch(url, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json', [CLIENT_HEADER]: CLIENT_VALUE },
          body: JSON.stringify(body),
        }),
        2000,
        'stop timed out',
      );
    } catch {
      // Best effort: the editor also expires idle sessions on its own.
    }
  }
}
