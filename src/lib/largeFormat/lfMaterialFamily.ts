/**
 * Material "family" grouping for large-format rolls.
 *
 * Catalog names follow the convention `<PRODUCT NAME> <width>*<length>m`
 * (e.g. "ORACAL MATT 1.27*50m" and "ORACAL MATT 1.62*50m"). Two entries that
 * differ only in the trailing roll-size token are the same physical material
 * on rolls of different width, so workshop jobs ordered for either can be
 * printed on whichever roll is cheaper for the combined layout.
 */

/** Trailing roll-size token, e.g. " 1.27*50m", " 1,62 * 50 m". */
const ROLL_SIZE_SUFFIX_PATTERN = /\s+\d+(?:[.,]\d+)?\s*\*\s*\d+(?:[.,]\d+)?\s*m$/i;

/**
 * Family key derived from a material display name: the name with the trailing
 * roll-size token stripped, whitespace-normalized. When the name carries no
 * recognizable roll-size suffix the full (normalized) name is the family, so
 * such materials always form single-member families.
 */
export function lfMaterialFamilyKey(name: string): string {
  const stripped = name.trim().replace(ROLL_SIZE_SUFFIX_PATTERN, "");
  return stripped.replace(/\s+/g, " ").trim();
}
