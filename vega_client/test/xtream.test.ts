import { ApiError, normalizeServerUrl, XtreamClient } from '../src/api/xtream';

type FetchCall = { url: string; init?: RequestInit };

function mockFetch(handler: (url: string, init?: RequestInit) => { status?: number; body: unknown }) {
  const calls: FetchCall[] = [];
  (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const { status = 200, body } = handler(url, init);
    return {
      status,
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    };
  });
  return calls;
}

const creds = { server: 'tv.example.com:36400/', username: 'user', password: 'p@ss' };

describe('normalizeServerUrl', () => {
  it('adds a scheme and strips trailing slashes', () => {
    expect(normalizeServerUrl(' tv.example.com:36400/ ')).toBe('http://tv.example.com:36400');
    expect(normalizeServerUrl('https://tv.example.com')).toBe('https://tv.example.com');
  });
});

describe('XtreamClient', () => {
  it('sends the m3u-tv client header and accepts an m3u-editor server', async () => {
    const calls = mockFetch(() => ({ body: { user_info: { auth: 1 }, m3u_editor: { version: '0.10.0' } } }));
    const client = new XtreamClient(creds);
    const auth = await client.authenticate();
    expect(auth.m3u_editor?.version).toBe('0.10.0');
    expect(calls[0].url).toBe('http://tv.example.com:36400/player_api.php?username=user&password=p%40ss');
    expect((calls[0].init?.headers as Record<string, string>)['X-M3UE-Client']).toBe('m3u-tv');
  });

  it('rejects plain Xtream servers', async () => {
    mockFetch(() => ({ body: { user_info: { auth: 1 } } }));
    await expect(new XtreamClient(creds).authenticate()).rejects.toThrow('requires an m3u-editor backend');
  });

  it('reports the server status text on failed auth', async () => {
    mockFetch(() => ({ body: { user_info: { auth: 0, status: 'Expired' } } }));
    await expect(new XtreamClient(creds).authenticate()).rejects.toThrow('Expired');
  });

  it('surfaces error messages from HTTP failures', async () => {
    mockFetch(() => ({ status: 403, body: { message: 'Playlist disabled' } }));
    const error = await new XtreamClient(creds).getLiveCategories().catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.message).toBe('Playlist disabled');
    expect(error.status).toBe(403);
  });

  it('builds playback URLs with the session client_id', () => {
    const client = new XtreamClient(creds);
    expect(client.liveUrl(42)).toMatch(/^http:\/\/tv\.example\.com:36400\/live\/user\/p@ss\/42\.m3u8\?proxy=true&player=true&client_id=m3utv-[0-9a-f]{16}$/);
    expect(client.movieUrl(7, 'mkv')).toMatch(/\/movie\/user\/p@ss\/7\.mkv\?/);
    expect(client.episodeUrl('99')).toMatch(/\/series\/user\/p@ss\/99\.mp4\?/);
  });

  it('merges EPG batch days, decodes base64 and dedupes by start time', async () => {
    const programme = (start: number, title: string) => ({
      title,
      description: '',
      start_timestamp: String(start),
      stop_timestamp: String(start + 1800),
    });
    mockFetch((url) => {
      const isFirstDay = url.includes('date=2026-01-01');
      return {
        body: {
          '5': {
            epg_listings: isFirstDay
              ? [programme(1000, 'TW9ybmluZyBTaG93'), programme(2800, 'Late')]
              : [programme(2800, 'Late'), programme(4600, 'Night')],
          },
        },
      };
    });
    const result = await new XtreamClient(creds).getEpgBatch(
      [5],
      [new Date(2026, 0, 1, 12), new Date(2026, 0, 2, 12)],
    );
    expect(result.get(5)?.map((p) => p.title)).toEqual(['Morning Show', 'Late', 'Night']);
  });

  it('posts progress as JSON with string values', async () => {
    const calls = mockFetch(() => ({ body: {} }));
    await new XtreamClient(creds).updateProgress('viewer-1', {
      content_type: 'vod',
      stream_id: 12,
      position_seconds: 300,
      duration_seconds: 6000,
      completed: false,
    });
    expect(calls[0].url).toContain('action=update_progress');
    expect(calls[0].init?.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      viewer_id: 'viewer-1',
      content_type: 'vod',
      stream_id: '12',
      position_seconds: '300',
      duration_seconds: '6000',
      completed: 'false',
    });
  });
});
