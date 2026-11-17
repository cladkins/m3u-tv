import { pollForApproval, requestDeviceCode } from '../src/api/pairing';

function respond(sequence: unknown[]) {
  let i = 0;
  (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async () => {
    const body = sequence[Math.min(i, sequence.length - 1)];
    i += 1;
    return { status: 400, text: async () => JSON.stringify(body) };
  });
}

describe('device pairing', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('reads the device code', async () => {
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({
      status: 200,
      text: async () =>
        JSON.stringify({ user_code: 'ABCD-1234', device_code: 'dev', verification_uri: 'http://x/pair', interval: 3 }),
    }));
    const code = await requestDeviceCode('x');
    expect(code.userCode).toBe('ABCD-1234');
    expect(code.intervalSeconds).toBe(3);
  });

  it('polls through pending states and returns the first playlist login', async () => {
    respond([
      { status: 'authorization_pending' },
      { status: 'approved', playlists: [{ username: 'u1', password: 'p1' }, { username: 'u2', password: 'p2' }] },
    ]);
    const code = { userCode: 'A', deviceCode: 'd', verificationUri: '', intervalSeconds: 1, expiresAt: Date.now() + 60000 };
    const outcome = pollForApproval('tv.example.com', code, () => false);
    await jest.advanceTimersByTimeAsync(2500);
    await expect(outcome).resolves.toEqual({
      kind: 'approved',
      credentials: { server: 'http://tv.example.com', username: 'u1', password: 'p1' },
    });
  });

  it('stops on denial', async () => {
    respond([{ status: 'denied' }]);
    const code = { userCode: 'A', deviceCode: 'd', verificationUri: '', intervalSeconds: 1, expiresAt: Date.now() + 60000 };
    const outcome = pollForApproval('tv.example.com', code, () => false);
    await jest.advanceTimersByTimeAsync(1500);
    await expect(outcome).resolves.toEqual({ kind: 'denied' });
  });
});
