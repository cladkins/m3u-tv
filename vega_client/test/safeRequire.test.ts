import { safeRequire } from '../src/utils/safeRequire';

describe('safeRequire', () => {
  const g = globalThis as unknown as { ErrorUtils?: unknown };
  afterEach(() => {
    delete g.ErrorUtils;
  });

  function installErrorUtils() {
    const fatal = jest.fn();
    let handler: (e: unknown, isFatal?: boolean) => void = fatal;
    g.ErrorUtils = {
      getGlobalHandler: () => handler,
      setGlobalHandler: (h: typeof handler) => {
        handler = h;
      },
      reportFatalError: (e: unknown) => handler(e, true),
    };
    return { fatal, report: (e: unknown) => handler(e, true), current: () => handler };
  }

  it('turns an error reported as fatal during the load into an exception', () => {
    const utils = installErrorUtils();
    expect(() =>
      safeRequire(() => {
        utils.report(new Error('NativeModule: AsyncStorage is null.'));
        return undefined;
      }),
    ).toThrow('AsyncStorage is null');
    expect(utils.fatal).not.toHaveBeenCalled();
    expect(utils.current()).toBe(utils.fatal);
  });

  it('returns the module and restores the handler when the load succeeds', () => {
    const utils = installErrorUtils();
    expect(safeRequire(() => ({ ok: true }))).toEqual({ ok: true });
    expect(utils.current()).toBe(utils.fatal);
  });

  it('works without ErrorUtils', () => {
    expect(safeRequire(() => 5)).toBe(5);
  });
});
