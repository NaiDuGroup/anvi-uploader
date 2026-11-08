/**
 * «Повторить заказ» helpers (pure, unit-tested).
 *
 * A multi-file line of the repeated order comes back as one row per file: the
 * server stores new orders one file per line (`expandToOneFilePerLine`), except
 * sheet products (front + back) and DTF / UV / sublimation runs.
 */

type LayoutWithPhotos = { photoUrls: string[]; photoSettings: unknown[] };

/**
 * Mug / notebook / pen layout without the photos that are gone from storage
 * (`uploads/` expires after 7 days): the editor would otherwise point at dead
 * keys. Photo settings are index-aligned with the URLs, so both are filtered.
 */
export function withoutMissingLayoutPhotos<T extends LayoutWithPhotos>(
  layout: T | undefined,
  missing: ReadonlySet<string>,
): { layout: T | undefined; removed: number } {
  if (!layout || missing.size === 0 || !Array.isArray(layout.photoUrls)) return { layout, removed: 0 };
  const keep = layout.photoUrls.map((u) => !missing.has(u));
  const removed = keep.filter((k) => !k).length;
  if (removed === 0) return { layout, removed: 0 };
  return {
    layout: {
      ...layout,
      photoUrls: layout.photoUrls.filter((_, i) => keep[i]),
      photoSettings: (layout.photoSettings ?? []).filter((_, i) => keep[i] ?? true),
    },
    removed,
  };
}
