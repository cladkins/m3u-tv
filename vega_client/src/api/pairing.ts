import { normalizeServerUrl } from './xtream';
import { Credentials } from './types';

export interface DeviceCode {
  userCode: string;
  deviceCode: string;
  verificationUri: string;
  intervalSeconds: number;
  expiresAt: number;
}

interface TokenResponse {
  status?: string;
  interval?: number;
  username?: string;
  password?: string;
  playlists?: Array<{ username?: string; password?: string; name?: string }>;
  error?: string;
  message?: string;
}

async function postJson<T>(url: string, body: unknown): Promise<{ status: number; data: T }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  return { status: response.status, data: data as T };
}

export async function requestDeviceCode(serverInput: string): Promise<DeviceCode> {
  const server = normalizeServerUrl(serverInput);
  const { status, data } = await postJson<Record<string, unknown>>(`${server}/api/device/code`, {});
  const userCode = String(data.user_code ?? '');
  const deviceCode = String(data.device_code ?? '');
  if (status >= 400 || !userCode || !deviceCode) {
    const message = typeof data.message === 'string' ? data.message : undefined;
    throw new Error(message ?? 'This server does not support device pairing.');
  }
  const interval = Number(data.interval) || 5;
  const expiresIn = Number(data.expires_in) || 600;
  return {
    userCode,
    deviceCode,
    verificationUri: String(data.verification_uri ?? `${server}/pair`),
    intervalSeconds: interval,
    expiresAt: Date.now() + expiresIn * 1000,
  };
}

export type PairingOutcome =
  | { kind: 'approved'; credentials: Credentials }
  | { kind: 'expired' }
  | { kind: 'denied' }
  | { kind: 'cancelled' };

// Polls until the code is approved, denied or expires. Pending states come back
// as 4xx bodies, so the HTTP status is ignored and only `status` is read.
export async function pollForApproval(
  serverInput: string,
  code: DeviceCode,
  isCancelled: () => boolean,
): Promise<PairingOutcome> {
  const server = normalizeServerUrl(serverInput);
  let interval = code.intervalSeconds;
  while (Date.now() < code.expiresAt) {
    await new Promise<void>((resolve) => setTimeout(resolve, interval * 1000));
    if (isCancelled()) return { kind: 'cancelled' };
    let data: TokenResponse;
    try {
      data = (await postJson<TokenResponse>(`${server}/api/device/token`, { device_code: code.deviceCode })).data;
    } catch {
      continue;
    }
    if (isCancelled()) return { kind: 'cancelled' };
    switch (data.status) {
      case 'approved': {
        const first = data.playlists?.find((p) => p.username && p.password);
        const username = first?.username ?? data.username;
        const password = first?.password ?? data.password;
        if (username && password) {
          return { kind: 'approved', credentials: { server, username, password } };
        }
        return { kind: 'denied' };
      }
      case 'slow_down':
        interval = Number(data.interval) || interval + 5;
        break;
      case 'expired':
        return { kind: 'expired' };
      case 'denied':
        return { kind: 'denied' };
      default:
        break;
    }
  }
  return { kind: 'expired' };
}
