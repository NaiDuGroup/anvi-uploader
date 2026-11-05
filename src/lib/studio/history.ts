/**
 * Undo / redo history of the Studio document. Pure reducer: a drag or a run
 * of keystrokes on the same field (same `tag` within `COALESCE_MS`) becomes
 * one undo step.
 */

export const HISTORY_LIMIT = 80;
export const COALESCE_MS = 800;

export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  lastTag: string | null;
  lastAt: number;
}

export function initHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], lastTag: null, lastAt: 0 };
}

/** A new state. With the same `tag` as the previous commit shortly before, it replaces that step. */
export function commit<T>(h: History<T>, next: T, tag: string | null = null, now = Date.now()): History<T> {
  if (Object.is(next, h.present)) return h;
  const coalesce: boolean = tag != null && tag === h.lastTag && now - h.lastAt < COALESCE_MS && h.past.length > 0;
  const past: T[] = coalesce ? h.past : [...h.past, h.present].slice(-HISTORY_LIMIT);
  return { past, present: next, future: [], lastTag: tag, lastAt: now };
}

/** Replace the present without an undo step (font measured, variant refit, autosave restore). */
export function replacePresent<T>(h: History<T>, next: T): History<T> {
  return { ...h, present: next };
}

export function undo<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h;
  const prev: T = h.past[h.past.length - 1]!;
  return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future], lastTag: null, lastAt: 0 };
}

export function redo<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h;
  const [next, ...rest] = h.future;
  return { past: [...h.past, h.present], present: next!, future: rest, lastTag: null, lastAt: 0 };
}

/** Start over (another document opened): no undo across documents. */
export function resetHistory<T>(present: T): History<T> {
  return initHistory(present);
}
