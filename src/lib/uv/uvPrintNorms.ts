import { z } from "zod";
import { UV_DEFAULT_WHITE_LAYERS, UV_MAX_WHITE_LAYERS } from "@/lib/uv/uvConstants";

/**
 * How a stock item is usually printed on UV, kept in `StockItem.attributes`
 * next to its print area («Параметры печати»). The order editor starts the
 * item's main zone with these; the operator can change them per order and the
 * line keeps what was actually chosen.
 */
export interface UvPrintNorms {
  /** White underbase layers (0–5). */
  whiteLayers: number;
  varnish: boolean;
  /** Primer wiped on by hand before printing (metal, glass, some plastics). */
  primer: boolean;
}

export const DEFAULT_UV_PRINT_NORMS: UvPrintNorms = {
  whiteLayers: UV_DEFAULT_WHITE_LAYERS,
  varnish: false,
  primer: false,
};

/** Attribute keys (prefixed: the attributes object also holds category fields). */
export const UV_NORM_KEYS = {
  whiteLayers: "uvWhiteLayers",
  varnish: "uvVarnish",
  primer: "uvPrimer",
} as const;

export function clampUvWhiteLayers(value: unknown): number | null {
  const n: number = typeof value === "string" ? Number(value) : (value as number);
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return Math.min(UV_MAX_WHITE_LAYERS, Math.max(0, Math.trunc(n)));
}

/** Norms from item attributes; missing or invalid keys take the defaults. */
export function parseUvPrintNorms(attributes: unknown): UvPrintNorms {
  const r: Record<string, unknown> =
    attributes != null && typeof attributes === "object" && !Array.isArray(attributes)
      ? (attributes as Record<string, unknown>)
      : {};
  const white: number | null = clampUvWhiteLayers(r[UV_NORM_KEYS.whiteLayers]);
  const varnish: unknown = r[UV_NORM_KEYS.varnish];
  const primer: unknown = r[UV_NORM_KEYS.primer];
  return {
    whiteLayers: white ?? DEFAULT_UV_PRINT_NORMS.whiteLayers,
    varnish: typeof varnish === "boolean" ? varnish : DEFAULT_UV_PRINT_NORMS.varnish,
    primer: typeof primer === "boolean" ? primer : DEFAULT_UV_PRINT_NORMS.primer,
  };
}

/** Attribute entries to merge into `StockItem.attributes`. */
export function uvPrintNormsAttributes(norms: UvPrintNorms): Record<string, number | boolean> {
  return {
    [UV_NORM_KEYS.whiteLayers]: clampUvWhiteLayers(norms.whiteLayers) ?? DEFAULT_UV_PRINT_NORMS.whiteLayers,
    [UV_NORM_KEYS.varnish]: norms.varnish,
    [UV_NORM_KEYS.primer]: norms.primer,
  };
}

/** API body of the norms (catalog create / edit). */
export const uvPrintNormsSchema = z.object({
  whiteLayers: z.number().int().min(0).max(UV_MAX_WHITE_LAYERS),
  varnish: z.boolean(),
  primer: z.boolean(),
});
