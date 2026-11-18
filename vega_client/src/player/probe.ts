export type StreamKind = 'hls' | 'dash' | 'file';

export interface ProbeResult {
  kind: StreamKind;
  url: string;
  contentType: string;
  status: number;
  hops: number;
}

interface HeaderResult {
  status: number;
  contentType: string;
  location: string;
}

const PROBE_TIMEOUT_MS = 10000;
const MAX_REDIRECTS = 5;

function kindFor(contentType: string, url: string): StreamKind {
  const path = url.split('?')[0].toLowerCase();
  if (contentType.includes('mpegurl') || path.endsWith('.m3u8')) return 'hls';
  if (contentType.includes('dash+xml') || path.endsWith('.mpd')) return 'dash';
  return 'file';
}

export function resolveLocation(base: string, location: string): string {
  if (/^https?:\/\//i.test(location)) return location;
  const origin = base.match(/^https?:\/\/[^/]+/i)?.[0] ?? '';
  if (location.startsWith('//')) return `${base.split(':')[0]}:${location}`;
  if (location.startsWith('/')) return `${origin}${location}`;
  const dir = base.split('?')[0].replace(/[^/]*$/, '');
  return `${dir}${location}`;
}

// Reads only the response headers, then aborts: a live TS body never ends,
// and fetch() on React Native resolves only after the whole body arrives.
function readHeaders(url: string): Promise<HeaderResult> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const result: HeaderResult = { status: 0, contentType: '', location: '' };
      try {
        result.status = xhr.status;
        result.contentType = (xhr.getResponseHeader('content-type') || '').toLowerCase();
        result.location = xhr.getResponseHeader('location') || '';
      } catch {
        // Headers unavailable: the caller guesses from the URL.
      }
      try {
        xhr.abort();
      } catch {
        // ignore
      }
      resolve(result);
    };
    const timer = setTimeout(finish, PROBE_TIMEOUT_MS);
    xhr.onreadystatechange = () => {
      if (xhr.readyState >= 2) finish();
    };
    xhr.onerror = finish;
    xhr.open('GET', url);
    xhr.send();
  });
}

// The editor answers a stream URL with a redirect to whatever its profile
// produced: an HLS playlist, a raw MPEG-TS feed or a file. Vega's networking
// does not follow redirects (Amazon's Shaka build carries a patch for the
// same reason), so they are followed here by hand.
export async function probeStream(url: string): Promise<ProbeResult> {
  let current = url;
  for (let hops = 0; ; hops++) {
    const headers = await readHeaders(current);
    const isRedirect = headers.status >= 300 && headers.status < 400 && !!headers.location;
    if (isRedirect && hops < MAX_REDIRECTS) {
      current = resolveLocation(current, headers.location);
      continue;
    }
    return {
      kind: kindFor(isRedirect ? '' : headers.contentType, current),
      url: current,
      contentType: headers.contentType,
      status: headers.status,
      hops,
    };
  }
}
