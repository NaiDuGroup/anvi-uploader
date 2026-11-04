import type { ShopProduct, ShopQuoteLine } from "./types";

/**
 * Storefront designs made in the studio's template editor (mug, notebook,
 * pen), run inside the shop at `/editor/<kind>` (`/shop/editor/<kind>` on
 * print.anvi.md). Pure and client-safe: the cart, the editor page and the
 * checkout share these shapes.
 *
 * A design line is an ordinary mug / notebook / pen cart line whose file is
 * the editor's print PNG; `design` keeps what is needed to open it again and,
 * at checkout, becomes the order line's `mugLayoutData` / `notebookLayoutData`
 * / `penLayoutData` (the studio editor saves the same JSON).
 */

export const SHOP_EDITOR_KINDS = ["mug", "notebook", "pen"] as const;
export type ShopEditorKind = (typeof SHOP_EDITOR_KINDS)[number];

export function isShopEditorKind(v: unknown): v is ShopEditorKind {
  return v === "mug" || v === "notebook" || v === "pen";
}

export interface ShopDesignPhotoSettings {
  fitMode: "cover" | "contain";
  alignment: "left" | "center" | "right";
  verticalAlignment?: "top" | "center" | "bottom";
  naturalWidth?: number;
  naturalHeight?: number;
}

/** The studio editor's layout JSON (`mugLayoutDataSchema` and its notebook / pen twins). */
export interface ShopDesignLayout {
  templateId: string;
  text: string;
  fontFamily: string;
  textColor: string;
  backgroundColor: string;
  /** Uploaded photo keys (`uploads/…`, order scope), in slot order. */
  photoUrls: string[];
  photoSettings: ShopDesignPhotoSettings[];
}

export interface ShopLineDesign {
  editor: ShopEditorKind;
  layout: ShopDesignLayout;
  /** Small JPEG data URL of the print layout (cart thumbnail); client-only. */
  preview?: string;
}

/** Longest preview data URL kept in the cart (localStorage), ≈ 60 KB. */
export const SHOP_DESIGN_PREVIEW_MAX = 80_000;
export const SHOP_DESIGN_TEXT_MAX = 500;
export const SHOP_DESIGN_MAX_PHOTOS = 10;

/** Editor kind of a storefront product, from its studio editor link (`/mug`, `/notebook`, `/pen`). */
export function productEditorKind(product: Pick<ShopProduct, "editorHref" | "simpleKind">): ShopEditorKind | null {
  const k: string = (product.editorHref ?? "").replace(/^\/+/, "").split(/[/?#]/)[0] ?? "";
  if (!isShopEditorKind(k)) return null;
  // The editor makes the line of its own kind only (a mug design is a `mug` quote line).
  return product.simpleKind === k ? k : null;
}

/**
 * Storefront link of the shop-mode editor (written the `/shop/...` way; pass
 * it through `href()` for the host).
 */
export function shopEditorPath(
  kind: ShopEditorKind,
  opts: { slug?: string | null; variant?: string | null; edit?: string | null } = {},
): string {
  const q = new URLSearchParams();
  if (opts.slug) q.set("slug", opts.slug);
  if (opts.variant) q.set("variant", opts.variant);
  if (opts.edit) q.set("edit", opts.edit);
  const s: string = q.toString();
  return `/shop/editor/${kind}${s ? `?${s}` : ""}`;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

const FIT = new Set(["cover", "contain"]);
const ALIGN = new Set(["left", "center", "right"]);
const VALIGN = new Set(["top", "center", "bottom"]);

function parsePhotoSettings(v: unknown): ShopDesignPhotoSettings | null {
  if (!isObj(v) || !FIT.has(v.fitMode as string) || !ALIGN.has(v.alignment as string)) return null;
  return {
    fitMode: v.fitMode as ShopDesignPhotoSettings["fitMode"],
    alignment: v.alignment as ShopDesignPhotoSettings["alignment"],
    ...(VALIGN.has(v.verticalAlignment as string)
      ? { verticalAlignment: v.verticalAlignment as ShopDesignPhotoSettings["verticalAlignment"] }
      : {}),
    ...(typeof v.naturalWidth === "number" && v.naturalWidth > 0 ? { naturalWidth: v.naturalWidth } : {}),
    ...(typeof v.naturalHeight === "number" && v.naturalHeight > 0 ? { naturalHeight: v.naturalHeight } : {}),
  };
}

/** A layout as the cart / checkout keeps it; null when malformed. */
export function parseDesignLayout(v: unknown): ShopDesignLayout | null {
  if (!isObj(v)) return null;
  const str = (x: unknown, max: number) => (typeof x === "string" && x.length <= max ? x : null);
  const templateId = str(v.templateId, 100);
  const text = str(v.text, SHOP_DESIGN_TEXT_MAX);
  const fontFamily = str(v.fontFamily, 100);
  const textColor = str(v.textColor, 40);
  const backgroundColor = str(v.backgroundColor, 40);
  if (!templateId || text == null || !fontFamily || !textColor || !backgroundColor) return null;
  if (!Array.isArray(v.photoUrls) || !Array.isArray(v.photoSettings)) return null;
  if (v.photoUrls.length > SHOP_DESIGN_MAX_PHOTOS) return null;
  const photoUrls: string[] = [];
  for (const p of v.photoUrls) {
    if (typeof p !== "string" || p.length === 0 || p.length > 500) return null;
    photoUrls.push(p);
  }
  const photoSettings: ShopDesignPhotoSettings[] = [];
  for (const s of v.photoSettings.slice(0, SHOP_DESIGN_MAX_PHOTOS)) {
    const parsed = parsePhotoSettings(s);
    if (!parsed) return null;
    photoSettings.push(parsed);
  }
  return { templateId, text, fontFamily, textColor, backgroundColor, photoUrls, photoSettings };
}

/** The `design` of a stored cart line; null when absent or malformed (the line stays, without «edit design»). */
export function parseLineDesign(v: unknown, quote: ShopQuoteLine): ShopLineDesign | null {
  if (!isObj(v) || !isShopEditorKind(v.editor) || v.editor !== quote.kind) return null;
  const layout = parseDesignLayout(v.layout);
  if (!layout) return null;
  const preview =
    typeof v.preview === "string" && v.preview.startsWith("data:image/") && v.preview.length <= SHOP_DESIGN_PREVIEW_MAX
      ? v.preview
      : undefined;
  return { editor: v.editor, layout, ...(preview ? { preview } : {}) };
}

/** What the checkout sends for a design line (no preview). */
export function checkoutDesign(design: ShopLineDesign): { editor: ShopEditorKind; layout: ShopDesignLayout } {
  return { editor: design.editor, layout: design.layout };
}

/**
 * Cart line of a design made in the shop-mode editor: an ordinary
 * mug / notebook / pen line (variant + quantity) with the editor's print file
 * attached, the layout and a thumbnail. Editing again keeps the line's id,
 * place and age.
 */
export function designCartLine(args: {
  kind: ShopEditorKind;
  slug: string;
  variantId: string;
  quantity: number;
  file: { fileKey: string; fileName: string; sizeBytes?: number };
  layout: ShopDesignLayout;
  preview: string | null;
  title: string;
  optionsText: string;
  /** Fallback image when there is no preview (the variant's photo). */
  image: string | null;
  lastTotal: number | null;
  id: string;
  addedAt: number;
}): {
  id: string;
  slug: string;
  title: string;
  optionsText: string;
  image: string | null;
  quote: ShopQuoteLine;
  files: { fileKey: string; fileName: string; sizeBytes?: number }[];
  lastTotal: number | null;
  addedAt: number;
  design: ShopLineDesign;
} {
  const preview: string | undefined =
    args.preview && args.preview.length <= SHOP_DESIGN_PREVIEW_MAX ? args.preview : undefined;
  return {
    id: args.id,
    slug: args.slug,
    title: args.title,
    optionsText: args.optionsText,
    image: preview ?? args.image,
    quote: { kind: args.kind, productId: args.variantId, quantity: Math.max(1, Math.round(args.quantity)) },
    files: [
      {
        fileKey: args.file.fileKey,
        fileName: args.file.fileName,
        ...(args.file.sizeBytes != null ? { sizeBytes: args.file.sizeBytes } : {}),
      },
    ],
    lastTotal: args.lastTotal,
    addedAt: args.addedAt,
    design: { editor: args.kind, layout: args.layout, ...(preview ? { preview } : {}) },
  };
}
