interface ErrorUtilsLike {
  getGlobalHandler?: () => (error: unknown, isFatal?: boolean) => void;
  setGlobalHandler?: (handler: (error: unknown, isFatal?: boolean) => void) => void;
}

// Metro wraps a lazy require() in a guard that reports anything the module
// throws while loading as a FATAL error instead of rethrowing it. A release
// build aborts on that, so try/catch around require() can't save the app.
// This swaps the global handler for the duration of the load and turns the
// reported error back into a normal exception.
export function safeRequire<T>(load: () => T): T {
  const utils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (!utils?.getGlobalHandler || !utils.setGlobalHandler) return load();
  const previous = utils.getGlobalHandler();
  let captured: { error: unknown } | null = null;
  utils.setGlobalHandler((error) => {
    captured = { error };
  });
  try {
    const result = load();
    if (captured) throw (captured as { error: unknown }).error;
    return result;
  } finally {
    utils.setGlobalHandler(previous);
  }
}
