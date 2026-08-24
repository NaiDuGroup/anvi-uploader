/**
 * Deterministic, human-readable file names for Design Studio renders.
 *
 * Replaces the manual "invent a unique name with the colour in it" workflow:
 * the name carries the design title, the product SKU (which encodes the
 * model/colour) and a short design-id suffix for hard uniqueness. Storage
 * keys additionally get a `Date.now()-nanoid` prefix from `/api/upload-url`,
 * so collisions are impossible even for identical display names.
 */

function sanitizeNamePart(part: string): string {
  return part
    .replace(/[^\p{L}\p{N}\-_]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export interface DesignFileNameInput {
  title: string;
  /** Product SKU when the design targets a catalog mug/notebook. */
  sku?: string | null;
  /** Design id; only the first 6 chars are used. */
  designId: string;
}

export function buildDesignFileName(input: DesignFileNameInput): string {
  const parts = [
    sanitizeNamePart(input.title) || "design",
    input.sku ? sanitizeNamePart(input.sku) : null,
    input.designId.replace(/-/g, "").slice(0, 6),
  ].filter((p): p is string => !!p && p.length > 0);
  return `${parts.join("_")}.png`;
}
