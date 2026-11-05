import { UV_DTF_WHITE_LAYERS, UV_MAX_PIECES, UV_MAX_ZONES } from "@/lib/uv/uvConstants";
import type { ShopUvStickerZone, ShopUvStickersLine } from "../types";

/**
 * UV-DTF stickers on the storefront (`/p/stickere-uv-dtf`): the customer
 * uploads up to 6 designs (PNG with a transparent background), sets each
 * one's size and the number of sets. The line is the studio wizard's UV line
 * `source: "stickers"`, technique «transfer», placement «as_is» (taken away),
 * 2 white layers + varnish (memory note «UV-DTF stickers») — priced by the UV
 * engine on the server (film metres × 500 lei, minimum 100, rounded to 5).
 * Pure, client-safe.
 */

export const SHOP_UV_STICKERS_SLUG = "stickere-uv-dtf";
export const SHOP_UV_IMAGE = "/print-shop/uv-dtf-stickers.svg";
/** Film printable width (cm), `PrintMethod('uv').settings.uvDtfPrintableWidthCm` default. */
export const SHOP_UV_FILM_WIDTH_CM = 30;
/** Display only — the server price comes from the UV settings. */
export const SHOP_UV_PER_METER_MDL = 500;
export const SHOP_UV_MINIMUM_MDL = 100;
export const SHOP_UV_MAX_DESIGNS = UV_MAX_ZONES;
export const SHOP_UV_MAX_SETS = UV_MAX_PIECES;
export const SHOP_UV_MIN_SIDE_CM = 1;
export const SHOP_UV_MAX_SIDE_CM = 100;

/** A zone of a design `n` (1-based): «s1», «s2»… — the file's `zone`. */
export function uvStickerZoneId(n: number): string {
  return `s${n}`;
}

export function uvStickerZone(id: string, widthCm: number, heightCm: number): ShopUvStickerZone {
  return { id, placement: "as_is", widthCm, heightCm, whiteLayers: UV_DTF_WHITE_LAYERS, varnish: true, primer: false };
}

/** Why a size does not fit the film, or null. */
export function uvStickerSizeProblem(widthCm: number, heightCm: number): "range" | "too_wide" | null {
  const ok = (n: number) => Number.isFinite(n) && n >= SHOP_UV_MIN_SIDE_CM && n <= SHOP_UV_MAX_SIDE_CM;
  if (!ok(widthCm) || !ok(heightCm)) return "range";
  return Math.min(widthCm, heightCm) > SHOP_UV_FILM_WIDTH_CM ? "too_wide" : null;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

/** A stored / sent UV-DTF stickers line as the shop builds it. */
export function isShopUvStickersLine(v: unknown): v is ShopUvStickersLine {
  if (!isObj(v) || v.kind !== "uv" || v.source !== "stickers" || v.technique !== "transfer") return false;
  if (typeof v.quantity !== "number" || !Number.isInteger(v.quantity) || v.quantity < 1 || v.quantity > SHOP_UV_MAX_SETS) return false;
  if (!Array.isArray(v.zones) || v.zones.length < 1 || v.zones.length > SHOP_UV_MAX_DESIGNS) return false;
  const ids = new Set<string>();
  for (const z of v.zones) {
    if (!isObj(z) || typeof z.id !== "string" || z.placement !== "as_is") return false;
    if (typeof z.widthCm !== "number" || typeof z.heightCm !== "number" || uvStickerSizeProblem(z.widthCm, z.heightCm)) return false;
    ids.add(z.id);
  }
  return ids.size === v.zones.length;
}

/** One file per design, tagged with its zone. */
export function uvStickersFilesProblem(
  zones: readonly { id: string }[],
  files: readonly { zone?: string }[],
): "required" | "too_many" | null {
  const ids: string[] = zones.map((z) => z.id);
  const tagged: string[] = files.map((f, i) => (f.zone && ids.includes(f.zone) ? f.zone : (ids[i] ?? "")));
  if (ids.some((id) => !tagged.includes(id))) return "required";
  if (files.length !== ids.length) return "too_many";
  return null;
}

const cm = (n: number): string => String(Math.round(n * 10) / 10).replace(".", ",");

/**
 * Russian staff row: «Наклейки UV-DTF: 3 дизайна × 20 компл. (5×5, 7×3, 10×4 см) — плёнка, 2 белых + лак, без переноса».
 */
export function uvStickersStaffSummaryRu(
  line: { quantity: number; zones: readonly { id: string; widthCm?: number; heightCm?: number }[] },
  files: readonly { fileName: string; zone?: string }[] = [],
  opts: { short?: boolean } = {},
): string {
  const n: number = line.zones.length;
  const head = `Наклейки UV-DTF: ${n} ${n === 1 ? "дизайн" : n < 5 ? "дизайна" : "дизайнов"} × ${line.quantity} компл.`;
  if (opts.short) return head;
  const sizes: string = line.zones.map((z) => `${cm(z.widthCm ?? 0)}×${cm(z.heightCm ?? 0)}`).join(", ");
  const names: string = files.length ? `; файлы: ${files.map((f) => f.fileName).join(", ")}` : "";
  return `${head} (${sizes} см) — плёнка A+B, 2 белых + лак, без переноса${names}`;
}
