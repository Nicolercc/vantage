/** A signal that never aborts: the default when no caller-wide deadline applies. */
export const NEVER: AbortSignal = new AbortController().signal;

/** Aborts when `signal` does or after `ms`, whichever is first. */
export const until = (signal: AbortSignal, ms: number): AbortSignal => AbortSignal.any([signal, AbortSignal.timeout(ms)]);
