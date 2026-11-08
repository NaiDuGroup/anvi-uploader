/**
 * Design Studio renders live under `designs/…`, outside the 7-day `uploads/`
 * lifecycle rule, so a re-save must delete the render / thumb it replaces —
 * otherwise every «Сохранить» / «В заказ» leaves two objects forever.
 * Pure (client-safe, unit-tested); the deletion itself is in `renderCleanupServer.ts`.
 */
export const DESIGN_RENDER_PREFIX = "designs/";

type RenderKeys = { renderKey: string | null; thumbKey: string | null };

/** Old `designs/` keys no longer used after `next` replaces `prev`. */
export function supersededDesignRenderKeys(prev: RenderKeys, next: Partial<RenderKeys>): string[] {
  const kept = new Set(
    [next.renderKey ?? prev.renderKey, next.thumbKey ?? prev.thumbKey].filter((k): k is string => Boolean(k)),
  );
  return [...new Set([prev.renderKey, prev.thumbKey])].filter(
    (k): k is string => Boolean(k) && k!.startsWith(DESIGN_RENDER_PREFIX) && !kept.has(k!),
  );
}
