import { TURNSTILE_HEADER } from "./config";

/**
 * Browser side of Turnstile. A mounted `TurnstileWidget` registers itself
 * here; without one (protection off, or a page that does not need it) every
 * helper is a no-op, so callers can use them unconditionally.
 *
 * - `turnstileHeaders()` — one fresh token as `{ "x-turnstile-token": … }`
 *   (storefront checkout / login). Tokens are single-use: the widget fetches
 *   the next one right away.
 * - `ensureTurnstilePass()` — walk-in uploader: one check per page visit,
 *   turned into a 2-hour cookie by `POST /api/turnstile/pass`.
 * - `turnstileRejected()` — the server answered 403 `turnstile_failed`:
 *   forget the pass and start a fresh check (the next submit retries).
 */

export type TurnstileWidgetState = "loading" | "ready" | "interactive" | "unavailable";

export interface TurnstileWidgetHandle {
  /** Resolves with a token, or null on timeout / when Turnstile is unavailable. */
  takeToken(timeoutMs: number): Promise<string | null>;
  state(): TurnstileWidgetState;
  reset(): void;
  showError(): void;
}

let widget: TurnstileWidgetHandle | null = null;
let passPromise: Promise<void> | null = null;

export function registerTurnstileWidget(handle: TurnstileWidgetHandle): () => void {
  widget = handle;
  passPromise = null;
  return () => {
    if (widget === handle) widget = null;
    passPromise = null;
  };
}

export function hasTurnstileWidget(): boolean {
  return widget != null;
}

export class TurnstileFailedError extends Error {
  constructor() {
    super("turnstile_failed");
  }
}

/** A token, or null without a widget / when none came in time. */
export async function getTurnstileToken(timeoutMs = 15_000): Promise<string | null> {
  return widget ? widget.takeToken(timeoutMs) : null;
}

export async function turnstileHeaders(timeoutMs?: number): Promise<Record<string, string>> {
  const token = await getTurnstileToken(timeoutMs);
  return token ? { [TURNSTILE_HEADER]: token } : {};
}

export function ensureTurnstilePass(): Promise<void> {
  const w = widget;
  if (!w) return Promise.resolve();
  if (!passPromise) {
    passPromise = (async () => {
      const token = await w.takeToken(20_000);
      // No token because Cloudflare could not be reached: the server lets walk-in clients through (logged).
      const body = token ? { token } : { unavailable: w.state() === "unavailable" };
      const res = await fetch("/api/turnstile/pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new TurnstileFailedError();
    })().catch((e: unknown) => {
      passPromise = null;
      w.reset();
      w.showError();
      throw e instanceof TurnstileFailedError ? e : new TurnstileFailedError();
    });
  }
  return passPromise;
}

export function turnstileRejected(): void {
  passPromise = null;
  widget?.reset();
}
