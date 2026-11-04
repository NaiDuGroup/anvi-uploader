import { after } from "next/server";

/**
 * Run `task` after the response (Next `after()`); outside a request scope
 * (unit tests, scripts) it just starts it. Errors are logged, never thrown.
 */
export function runAfter(task: () => Promise<unknown>): void {
  const safe = () => task().catch((e: unknown) => console.error("[runAfter] task failed:", e));
  try {
    after(safe);
  } catch {
    void safe();
  }
}
