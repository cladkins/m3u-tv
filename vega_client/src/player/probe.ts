export type StreamKind = 'hls' | 'dash' | 'file';

export interface ProbeResult {
  kind: StreamKind;
  url: string;
  contentType: string;
  status: number;
}

const PROBE_TIMEOUT_MS = 10000;

function kindFor(contentType: string, url: string): StreamKind {
  const path = url.split('?')[0].toLowerCase();
  if (contentType.includes('mpegurl') || path.endsWith('.m3u8')) return 'hls';
  if (contentType.includes('dash+xml') || path.endsWith('.mpd')) return 'dash';
  return 'file';
}

// The editor answers a stream URL with a redirect to whatever the profile
// produced: an HLS playlist, a raw MPEG-TS feed or a file. Only the response
// headers are read before the request is aborted, because a live TS body never
// ends. fetch() resolves only after the full body on React Native, so this
// uses XMLHttpRequest, which reports headers as soon as they arrive.
export function probeStream(url: string): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      let contentType = '';
      let finalUrl = url;
      let status = 0;
      try {
        contentType = (xhr.getResponseHeader('content-type') || '').toLowerCase();
        finalUrl = xhr.responseURL || url;
        status = xhr.status;
      } catch {
        // Headers unavailable: fall back to guessing from the URL.
      }
      try {
        xhr.abort();
      } catch {
        // ignore
      }
      resolve({ kind: kindFor(contentType, finalUrl), url: finalUrl, contentType, status });
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
