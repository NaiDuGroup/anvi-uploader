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

/**
 * Made in ANVI Studio (`/studio/<kind>`): the customer's approval
 * («Verifică designul») and where the Studio document is kept (this browser's
 * IndexedDB, by `docId`). The preview is the approved print layout.
 */
export interface ShopLineStudio {
  v: 1;
  docId: string;
  /** ISO time the customer ticked «Am verificat designul». */
  approvedAt: string;
  /** Checklist items ticked (`STUDIO_APPROVAL_CHECKS`). */
  checks: string[];
  /** Small JPEG data URL of the approved print layout (≤ `SHOP_STUDIO_PREVIEW_MAX`). */
  preview?: string;
  templateId?: string;
}

export interface ShopLineDesign {
  editor: ShopEditorKind;
  layout: ShopDesignLayout;
  /** Small JPEG data URL of the print layout (cart thumbnail); client-only. */
  preview?: string;
  studio?: ShopLineStudio;
}

/** Checklist of the Studio approval step. */
export const STUDIO_APPROVAL_CHECKS = ["text", "edges", "quality", "product"] as const;
/** Longest Studio approval preview kept with the line and sent to checkout (≈ 40 KB JPEG). */
export const SHOP_STUDIO_PREVIEW_MAX = 60_000;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** A stored Studio approval; null when absent or malformed. */
export function parseLineStudio(v: unknown): ShopLineStudio | null {
  if (!isObj(v) || v.v !== 1) return null;
  if (typeof v.docId !== "string" || v.docId.length === 0 || v.docId.length > 60) return null;
  if (typeof v.approvedAt !== "string" || !ISO_RE.test(v.approvedAt)) return null;
  if (!Array.isArray(v.checks) || v.checks.length > 6) return null;
  const allowed = new Set<string>(STUDIO_APPROVAL_CHECKS);
  if (!v.checks.every((c) => typeof c === "string" && allowed.has(c))) return null;
  const preview =
    typeof v.preview === "string" && /^data:image\/(jpeg|png);base64,/.test(v.preview) && v.preview.length <= SHOP_STUDIO_PREVIEW_MAX
      ? v.preview
      : undefined;
  const templateId = typeof v.templateId === "string" && v.templateId.length <= 80 ? v.templateId : undefined;
  return {
    v: 1,
    docId: v.docId,
    approvedAt: v.approvedAt,
    checks: v.checks as string[],
    ...(preview ? { preview } : {}),
    ...(templateId ? { templateId } : {}),
  };
}

/** ANVI Studio link (written the `/shop/...` way; pass it through `href()`). */
export function studioEditorPath(
  kind: ShopEditorKind,
  opts: { slug?: string | null; variant?: string | null; edit?: string | null; from?: string | null; step?: "edit" | null } = {},
): string {
  const q = new URLSearchParams();
  if (opts.slug) q.set("slug", opts.slug);
  if (opts.variant) q.set("variant", opts.variant);
  if (opts.edit) q.set("edit", opts.edit);
  if (opts.from) q.set("from", opts.from);
  if (opts.step) q.set("step", opts.step);
  const s: string = q.toString();
  return `/shop/studio/${kind}${s ? `?${s}` : ""}`;
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
  const studio = v.studio == null ? null : parseLineStudio(v.studio);
  return { editor: v.editor, layout, ...(preview ? { preview } : {}), ...(studio ? { studio } : {}) };
}

/** What the checkout sends for a design line (no cart thumbnail; a Studio line keeps its approval + preview). */
export function checkoutDesign(design: ShopLineDesign): { editor: ShopEditorKind; layout: ShopDesignLayout; studio?: ShopLineStudio } {
  return { editor: design.editor, layout: design.layout, ...(design.studio ? { studio: design.studio } : {}) };
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
  /** ANVI Studio approval (Studio lines only). */
  studio?: ShopLineStudio;
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
    design: {
      editor: args.kind,
      layout: args.layout,
      ...(preview ? { preview } : {}),
      ...(args.studio ? { studio: args.studio } : {}),
    },
  };
}
