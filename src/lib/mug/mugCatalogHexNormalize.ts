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

/** For inner/rim: empty → null; expand `#rgb`. */
export function normNullableHex(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  if (typeof v !== "string") return undefined;
  return normalizeHexColor(v) ?? v;
}

/** POST: normalize all color fields before zod. */
export function normalizeMugCatalogCreateBody(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    ...raw,
    bodyColorHex: normOptionalHex(raw.bodyColorHex),
    handleColorHex: normOptionalHex(raw.handleColorHex),
    innerColorHex: normNullableHex(raw.innerColorHex),
    rimColorHex: normNullableHex(raw.rimColorHex),
  };
}

/** PATCH: only touch keys present in the payload. */
export function normalizeMugCatalogPatchBody(raw: Record<string, unknown>): Record<string, unknown> {
  const merged = { ...raw };
  if ("bodyColorHex" in raw) merged.bodyColorHex = normOptionalHex(raw.bodyColorHex);
  if ("handleColorHex" in raw) merged.handleColorHex = normOptionalHex(raw.handleColorHex);
  if ("innerColorHex" in raw) merged.innerColorHex = normNullableHex(raw.innerColorHex);
  if ("rimColorHex" in raw) merged.rimColorHex = normNullableHex(raw.rimColorHex);
  return merged;
}
