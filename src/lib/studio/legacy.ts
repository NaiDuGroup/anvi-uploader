import { buildMugTemplates } from "@/lib/mug/templates";
import { buildNotebookTemplates } from "@/lib/notebook/templates";
import { buildPenTemplates } from "@/lib/pen/templates";
import type { PrintSizeCm } from "@/lib/printDimensions";
import { SHOP_DESIGN_MAX_PHOTOS, SHOP_DESIGN_TEXT_MAX, type ShopDesignLayout } from "@/lib/storefront/design";
import {
  STUDIO_DOC_VERSION,
  docImages,
  docTexts,
  mmToPt,
  pxToMm,
  studioId,
  type StudioDoc,
  type StudioImageLayer,
  type StudioKind,
  type StudioLayer,
  type StudioShapeLayer,
  type StudioTextLayer,
} from "./document";
import { STUDIO_DEFAULT_PRINT, studioSurfaces, surfaceBase } from "./surfaces";

/**
 * Converters between the Studio document and the old editors' layout JSON
 * (`mugLayoutData` / `notebookLayoutData` / `penLayoutData`, the cart's
 * `ShopDesignLayout`).
 *
 * - old → Studio is exact for geometry (slots and caption box become layers in
 *   mm); the auto-fitted caption size is estimated (the old renderer measures
 *   it on a canvas).
 * - Studio → old is a summary: the order line keeps the old fields (caption
 *   text, first font and colour, background, photo keys) so the admin, stock
 *   and imposition read a Studio order like any other; the print PNG is the
 *   production truth. `templateId` is `studio` / `studio:<template>`.
 */

export const STUDIO_TEMPLATE_PREFIX = "studio";

type AnySlot = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  mask?: "rect" | "circle" | "heart" | "rounded";
  borderWidth?: number;
  borderColor?: string;
};
type AnyTextSlot = { x: number; y: number; width: number; height: number; align: string; baseline: string };
type AnyDecoration =
  | { kind: "darkBand"; x: number; y: number; width: number; height: number; color: string }
  | { kind: "heart"; x: number; y: number; size: number; color: string };
type AnyTemplate = {
  id: string;
  photoSlots: AnySlot[];
  textSlot: AnyTextSlot | null;
  decorations?: AnyDecoration[];
  noText?: boolean;
};

function legacyTemplates(kind: StudioKind, w: number, h: number): AnyTemplate[] {
  if (kind === "mug") return buildMugTemplates(w, h) as AnyTemplate[];
  if (kind === "notebook") return buildNotebookTemplates(w, h) as AnyTemplate[];
  return buildPenTemplates(w, h) as AnyTemplate[];
}

/** `#rgb`, `#rrggbb`, `rgb()` / `rgba()` → `#rrggbb` + alpha; null for `transparent` / unknown. */
export function parseCssColor(c: string | null | undefined): { hex: string; alpha: number } | null {
  if (!c) return null;
  const s: string = c.trim().toLowerCase();
  let m: RegExpMatchArray | null = s.match(/^#([0-9a-f]{6})$/);
  if (m) return { hex: `#${m[1]}`, alpha: 1 };
  m = s.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
  if (m) return { hex: `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`, alpha: 1 };
  m = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (m) {
    const to2 = (n: string) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, "0");
    return { hex: `#${to2(m[1]!)}${to2(m[2]!)}${to2(m[3]!)}`, alpha: m[4] != null ? Math.max(0, Math.min(1, Number(m[4]))) : 1 };
  }
  return null;
}

/** Caption size the old renderer would pick, roughly: fills the slot height for the lines, capped at 120 px. */
function estimateCaptionPx(text: string, slot: AnyTextSlot): number {
  const lines: string[] = text.split("\n");
  const longest: number = Math.max(1, ...lines.map((l) => l.length));
  const byHeight: number = slot.height / (lines.length * 1.3);
  const byWidth: number = slot.width / (longest * 0.55);
  return Math.max(12, Math.min(120, byHeight, byWidth));
}

/** An old layout as a Studio document (photos keep their upload keys). */
export function fromLegacyLayout(kind: StudioKind, layout: ShopDesignLayout, print: PrintSizeCm = STUDIO_DEFAULT_PRINT[kind]): StudioDoc {
  const spec = studioSurfaces(kind, print)[0]!;
  const dpi: number = print.dpi;
  const toMm = (px: number) => pxToMm(px, dpi);
  const templates: AnyTemplate[] = legacyTemplates(kind, spec.pxW, spec.pxH);
  const tpl: AnyTemplate = templates.find((t) => t.id === layout.templateId) ?? templates[0]!;
  const layers: StudioLayer[] = [];

  tpl.photoSlots.forEach((slot, i) => {
    const key: string | undefined = layout.photoUrls[i];
    const st = layout.photoSettings[i];
    const img: StudioImageLayer = {
      id: studioId(),
      kind: "image",
      x: toMm(slot.x),
      y: toMm(slot.y),
      w: toMm(slot.width),
      h: toMm(slot.height),
      rotation: slot.rotation ? (slot.rotation * 180) / Math.PI : 0,
      src: key
        ? { key, naturalW: st?.naturalWidth ?? spec.pxW, naturalH: st?.naturalHeight ?? spec.pxH }
        : null,
      mask: slot.mask ?? "rect",
      crop: {
        zoom: 1,
        ox: st?.alignment === "left" ? -1 : st?.alignment === "right" ? 1 : 0,
        oy: st?.verticalAlignment === "top" ? -1 : st?.verticalAlignment === "bottom" ? 1 : 0,
      },
      ...(slot.borderWidth
        ? { frame: { color: parseCssColor(slot.borderColor ?? "#ffffff")?.hex ?? "#ffffff", widthMm: toMm(slot.borderWidth) } }
        : {}),
    };
    layers.push(img);
  });

  for (const d of tpl.decorations ?? []) {
    const c = parseCssColor(d.color);
    if (!c) continue;
    const shape: StudioShapeLayer =
      d.kind === "darkBand"
        ? { id: studioId(), kind: "shape", shape: "rect", x: toMm(d.x), y: toMm(d.y), w: toMm(d.width), h: toMm(d.height), rotation: 0, fill: c.hex, ...(c.alpha < 1 ? { opacity: c.alpha } : {}) }
        : { id: studioId(), kind: "shape", shape: "heart", x: toMm(d.x), y: toMm(d.y), w: toMm(d.size), h: toMm(d.size), rotation: 0, fill: c.hex, ...(c.alpha < 1 ? { opacity: c.alpha } : {}) };
    layers.push(shape);
  }

  const slot: AnyTextSlot | null = tpl.textSlot;
  if (slot && !tpl.noText && layout.text.trim()) {
    const align: StudioTextLayer["align"] = slot.align === "left" || slot.align === "start" ? "left" : slot.align === "right" || slot.align === "end" ? "right" : "center";
    const left: number = align === "center" ? slot.x - slot.width / 2 : align === "right" ? slot.x - slot.width : slot.x;
    const top: number = slot.baseline === "middle" ? slot.y - slot.height / 2 : slot.baseline === "bottom" ? slot.y - slot.height : slot.y;
    layers.push({
      id: studioId(),
      kind: "text",
      x: toMm(left),
      y: toMm(top),
      w: toMm(slot.width),
      h: toMm(slot.height),
      rotation: 0,
      text: layout.text.slice(0, 400),
      fontFamily: layout.fontFamily,
      bold: true,
      sizePt: Math.round(mmToPt(toMm(estimateCaptionPx(layout.text, slot))) * 10) / 10,
      color: parseCssColor(layout.textColor)?.hex ?? "#000000",
      align,
      lineHeight: 1.3,
    });
  }

  const bg = parseCssColor(layout.backgroundColor);
  return {
    v: STUDIO_DOC_VERSION,
    id: studioId("d"),
    kind,
    templateId: `legacy:${tpl.id}`,
    surfaces: [{ ...surfaceBase(spec), background: bg && bg.alpha > 0 ? bg.hex : null, layers }],
    updatedAt: 0,
  };
}

/**
 * The old layout fields of a Studio document, for the order line
 * (`mugLayoutData` …) and the cart. Placeholder sample texts and photos not
 * uploaded yet are left out.
 */
export function toLegacyLayout(doc: StudioDoc): ShopDesignLayout {
  const texts: StudioTextLayer[] = docTexts(doc).filter((t) => !t.placeholder && t.text.trim() !== "");
  const images: StudioImageLayer[] = docImages(doc).filter((i) => !i.hidden && i.src?.key);
  const first: StudioTextLayer | undefined = texts[0];
  const bg: string | null = doc.surfaces[0]?.background ?? null;
  const tid: string = doc.templateId && !doc.templateId.startsWith("legacy:") ? `${STUDIO_TEMPLATE_PREFIX}:${doc.templateId}` : STUDIO_TEMPLATE_PREFIX;
  return {
    templateId: tid.slice(0, 100),
    text: texts.map((t) => t.text).join("\n").slice(0, SHOP_DESIGN_TEXT_MAX),
    fontFamily: first?.fontFamily ?? "Roboto",
    textColor: first?.color ?? "#000000",
    backgroundColor: bg ?? "transparent",
    photoUrls: images.slice(0, SHOP_DESIGN_MAX_PHOTOS).map((i) => i.src!.key!),
    photoSettings: images.slice(0, SHOP_DESIGN_MAX_PHOTOS).map((i) => ({
      fitMode: "cover" as const,
      alignment: "center" as const,
      verticalAlignment: "center" as const,
      naturalWidth: i.src!.naturalW,
      naturalHeight: i.src!.naturalH,
    })),
  };
}

/** True when the layout came from the Studio (its `templateId`). */
export function isStudioLegacyLayout(layout: Pick<ShopDesignLayout, "templateId">): boolean {
  return layout.templateId === STUDIO_TEMPLATE_PREFIX || layout.templateId.startsWith(`${STUDIO_TEMPLATE_PREFIX}:`);
}
