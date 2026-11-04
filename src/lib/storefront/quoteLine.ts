import type { ShopQuoteLine, ShopSimpleKind, ShopUvNorms, ShopVariant } from "./types";

/** Norms when an item card has none (the UV engine's defaults). */
const DEFAULT_UV_NORMS: ShopUvNorms = { whiteLayers: 1, varnish: false, primer: false, transfer: false };

/**
 * Quote line of a simple product option. A `uvItem` is the studio wizard's
 * UV stock line: the item's main print (sized and included in the item price
 * by the UV engine) with the item's print norms, UV-DTF when the card says
 * so. Pure (client-safe, unit-tested).
 */
export function simpleQuoteLine(
  kind: ShopSimpleKind,
  variant: Pick<ShopVariant, "id" | "uvNorms">,
  quantity: number,
): ShopQuoteLine {
  if (kind !== "uvItem") return { kind, productId: variant.id, quantity };
  const n: ShopUvNorms = variant.uvNorms ?? DEFAULT_UV_NORMS;
  return {
    kind: "uv",
    source: "stock",
    ...(n.transfer ? { technique: "transfer" as const } : {}),
    variantId: variant.id,
    quantity,
    zones: [{ id: "main", placement: "front", whiteLayers: n.whiteLayers, varnish: n.varnish, primer: n.primer }],
  };
}
