type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

/** Deferred work still runs this soon on a busy page, so a sheet never stays aliased. */
const IDLE_DEADLINE_MS = 300;
/** Without idle callbacks, run just after the current paint has been shown. */
const IDLE_FALLBACK_MS = 60;

/**
 * Runs `task` when the browser is idle (or shortly after, without idle
 * callbacks). Returns a function that cancels it if it has not run yet.
 */
export const whenIdle = (task: () => void): (() => void) => {
  const idle: IdleWindow = window;
  if (idle.requestIdleCallback && idle.cancelIdleCallback) {
    const handle = idle.requestIdleCallback(task, { timeout: IDLE_DEADLINE_MS });
    const cancel = idle.cancelIdleCallback;
    return () => cancel(handle);
  }
  const handle = window.setTimeout(task, IDLE_FALLBACK_MS);
  return () => window.clearTimeout(handle);
};
