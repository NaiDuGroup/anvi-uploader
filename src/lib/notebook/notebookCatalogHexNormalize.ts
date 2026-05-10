/** Expand `#rgb` → `#rrggbb` for `<input type="color">` quirks. */
export function normalizeHexColor(s: string | undefined): string | undefined {
  if (s === undefined) return undefined;
  const t = s.trim();
  if (!t.startsWith("#")) return s;
  const h = t.slice(1);
  if (h.length === 3 && /^[0-9A-Fa-f]{3}$/.test(h)) {
    return `#${h.split("").map((c) => `${c}${c}`).join("")}`;
  }
  return t;
}

export function normOptionalHex(v: unknown): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== "string") return undefined;
  return normalizeHexColor(v) ?? v;
}

export function normalizeNotebookCatalogCreateBody(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...raw,
    coverColorHex: normOptionalHex(raw.coverColorHex),
    strapColorHex: normOptionalHex(raw.strapColorHex),
    bookmarkColorHex: normOptionalHex(raw.bookmarkColorHex),
  };
}

export function normalizeNotebookCatalogPatchBody(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...raw };
  if ("coverColorHex" in raw) merged.coverColorHex = normOptionalHex(raw.coverColorHex);
  if ("strapColorHex" in raw) merged.strapColorHex = normOptionalHex(raw.strapColorHex);
  if ("bookmarkColorHex" in raw)
    merged.bookmarkColorHex = normOptionalHex(raw.bookmarkColorHex);
  return merged;
}
