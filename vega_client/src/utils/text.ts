import { decode as atob } from 'base-64';

const BASE64_LIKE = /^[A-Za-z0-9+/]+={0,2}$/;

function decodeUtf8Strict(binary: string): string | null {
  let out = '';
  let i = 0;
  while (i < binary.length) {
    const b0 = binary.charCodeAt(i++);
    if (b0 < 0x80) {
      out += String.fromCharCode(b0);
      continue;
    }
    let needed: number;
    let code: number;
    if (b0 >= 0xc2 && b0 <= 0xdf) {
      needed = 1;
      code = b0 & 0x1f;
    } else if (b0 >= 0xe0 && b0 <= 0xef) {
      needed = 2;
      code = b0 & 0x0f;
    } else if (b0 >= 0xf0 && b0 <= 0xf4) {
      needed = 3;
      code = b0 & 0x07;
    } else {
      return null;
    }
    if (i + needed > binary.length) return null;
    for (let k = 0; k < needed; k++) {
      const b = binary.charCodeAt(i++);
      if ((b & 0xc0) !== 0x80) return null;
      code = (code << 6) | (b & 0x3f);
    }
    out += String.fromCodePoint(code);
  }
  return out;
}

function hasControlCharacters(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) return true;
  }
  return false;
}

// EPG text arrives base64-encoded from some endpoints and plain from others.
// Short plain words ("GAME") also pass the base64 shape check, so a decode is
// only kept when it yields valid UTF-8 without control characters.
export function decodeBase64WhenApplicable(value: string): string {
  const text = value.trim();
  if (!text || text.length % 4 !== 0 || !BASE64_LIKE.test(text)) return value;
  try {
    const decoded = decodeUtf8Strict(atob(text));
    if (!decoded || hasControlCharacters(decoded)) return value;
    return decoded;
  } catch {
    return value;
  }
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export function formatClock(epochSeconds: number): string {
  const d = new Date(epochSeconds * 1000);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${suffix}`;
}

export function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function firstImage(value: string[] | string | undefined | null): string | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) return value.find((v) => !!v) || undefined;
  return value || undefined;
}

export function yearOf(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const match = String(value).match(/\d{4}/);
  return match ? match[0] : undefined;
}

export function randomHex(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += Math.floor(Math.random() * 16).toString(16);
  }
  return out;
}
