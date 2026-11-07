import { UV_DTF_WHITE_LAYERS } from "@/lib/uv/uvConstants";
import type { ShopQuoteLine, ShopSimpleKind, ShopUvNorms, ShopVariant } from "./types";

/** Norms when an item card has none (the UV engine's defaults). */
const DEFAULT_UV_NORMS: ShopUvNorms = { whiteLayers: 1, varnish: false, primer: false, transfer: false };

/**
 * Quote line of a simple product option. A `uvItem` is the studio wizard's
 * UV stock line: the item's main print (sized and included in the item price
 * by the UV engine) with the item's print norms, UV-DTF when the card says
 * so. A `sublItem` is the wizard's sublimation stock line (print included).
 * Pure (client-safe, unit-tested).
 */
export function simpleQuoteLine(
  kind: ShopSimpleKind,
  variant: Pick<ShopVariant, "id" | "uvNorms" | "uvZone">,
  quantity: number,
): ShopQuoteLine {
  if (kind === "sublItem") return { kind: "sublimation", variantId: variant.id, quantity };
  if (kind !== "uvItem") return { kind, productId: variant.id, quantity };
  const n: ShopUvNorms = variant.uvNorms ?? DEFAULT_UV_NORMS;
  // No print parameters on the item card: the product's fallback zone (the card's own size wins otherwise).
  const size = variant.uvZone ? { widthCm: variant.uvZone.widthCm, heightCm: variant.uvZone.heightCm } : {};
  return {
    kind: "uv",
    source: "stock",
    ...(n.transfer ? { technique: "transfer" as const } : {}),
    variantId: variant.id,
    quantity,
    zones: [
      {
        id: "main",
        placement: "front",
        ...size,
        // UV-DTF is always two white layers (the server forces it too).
        whiteLayers: n.transfer ? UV_DTF_WHITE_LAYERS : n.whiteLayers,
        varnish: n.varnish,
        primer: n.primer,
      },
    ],
  };
}
