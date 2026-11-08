/**
 * «Повторить заказ» helpers (pure, unit-tested).
 *
 * The wizard has one row per file. A new order makes one line per row, except
 * that rows coming from the same multi-file paper line of the repeated order
 * («листовая печать», several files in one line) go back into one line, as
 * long as the rows still agree on what is line-level (product, design link,
 * manual price per piece).
 */

/** Product types whose repeated multi-file lines stay one line (files carry their own copies / paper). */
export function keepsRepeatLineTogether(productType: string): boolean {
  return productType === "paper_print";
}

export interface RepeatLineJoinKey {
  /** Line id of the repeated order the row came from (null: not a grouped repeat row). */
  repeatLineKey: string | null | undefined;
  productType: string;
  designId: string | null | undefined;
  manualUnitPriceMdl: number | null | undefined;
}

/** Can row `next` add its file to the line row `prev` just created (rows adjacent)? */
export function canJoinRepeatLine(prev: RepeatLineJoinKey | null, next: RepeatLineJoinKey): boolean {
  if (!prev || !next.repeatLineKey || prev.repeatLineKey !== next.repeatLineKey) return false;
  if (!keepsRepeatLineTogether(next.productType) || prev.productType !== next.productType) return false;
  return (prev.designId ?? null) === (next.designId ?? null) && (prev.manualUnitPriceMdl ?? null) === (next.manualUnitPriceMdl ?? null);
}

/**
 * Position of each grouped row within its run of adjacent rows sharing a
 * `repeatLineKey`: `{ index: 1-based, count }`, only for runs of 2+.
 */
export function repeatLineRuns(
  rows: ReadonlyArray<{ id: string; repeatLineKey?: string | null }>,
): Map<string, { index: number; count: number }> {
  const out = new Map<string, { index: number; count: number }>();
  let i = 0;
  while (i < rows.length) {
    const key = rows[i]!.repeatLineKey;
    let j = i + 1;
    if (key) while (j < rows.length && rows[j]!.repeatLineKey === key) j++;
    if (key && j - i > 1) for (let k = i; k < j; k++) out.set(rows[k]!.id, { index: k - i + 1, count: j - i });
    i = j;
  }
  return out;
}

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
