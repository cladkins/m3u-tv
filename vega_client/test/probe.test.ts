import { probeStream, resolveLocation } from '../src/player/probe';

describe('resolveLocation', () => {
  it('handles absolute, root-relative and relative redirects', () => {
    expect(resolveLocation('https://a.com/live/u/p/1.m3u8?x=1', 'https://b.com/s.m3u8')).toBe('https://b.com/s.m3u8');
    expect(resolveLocation('https://a.com/live/u/p/1.m3u8?x=1', '/hls/1/index.m3u8')).toBe('https://a.com/hls/1/index.m3u8');
    expect(resolveLocation('https://a.com/live/u/p/1.m3u8?x=1', 'index.m3u8')).toBe('https://a.com/live/u/p/index.m3u8');
    expect(resolveLocation('https://a.com/x', '//cdn.com/y.ts')).toBe('https://cdn.com/y.ts');
  });
});

describe('probeStream', () => {
  const responses: Record<string, { status: number; headers: Record<string, string> }> = {
    'https://a.com/live/1.m3u8': { status: 302, headers: { location: '/proxy/1/playlist' } },
    'https://a.com/proxy/1/playlist': { status: 200, headers: { 'content-type': 'application/vnd.apple.mpegurl' } },
    'https://a.com/live/2.m3u8': { status: 302, headers: { location: 'http://provider.tv/2.ts' } },
    'http://provider.tv/2.ts': { status: 200, headers: { 'content-type': 'video/mp2t' } },
  };

  beforeAll(() => {
    class FakeXhr {
      readyState = 0;
      status = 0;
      onreadystatechange: (() => void) | null = null;
      onerror: (() => void) | null = null;
      private url = '';
      open(_method: string, url: string) {
        this.url = url;
      }
      send() {
        const response = responses[this.url];
        setTimeout(() => {
          this.status = response?.status ?? 404;
          this.readyState = 2;
          this.onreadystatechange?.();
        }, 0);
      }
      getResponseHeader(name: string) {
        return responses[this.url]?.headers[name.toLowerCase()] ?? null;
      }
      abort() {}
    }
    (globalThis as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = FakeXhr;
  });

  it('follows redirects to an HLS playlist', async () => {
    await expect(probeStream('https://a.com/live/1.m3u8')).resolves.toMatchObject({
      kind: 'hls',
      url: 'https://a.com/proxy/1/playlist',
      status: 200,
      hops: 1,
    });
  });

  it('sends a raw TS redirect target to URL mode', async () => {
    await expect(probeStream('https://a.com/live/2.m3u8')).resolves.toMatchObject({
      kind: 'file',
      url: 'http://provider.tv/2.ts',
      contentType: 'video/mp2t',
    });
  });
});
