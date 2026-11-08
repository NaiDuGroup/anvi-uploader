import {
  Coffee,
  Contact,
  FileText,
  Flame,
  Gift,
  Layers,
  Mail,
  Maximize,
  Newspaper,
  Notebook,
  Package,
  PenLine,
  Shirt,
  Sparkles,
  Sticker,
  StickyNote,
  type LucideIcon,
} from "lucide-react";
import { parseUvLineData } from "@/lib/uv/parseUvLineData";
import { isLegacyReadySetLine, parseOrderLineSetData } from "@/lib/giftSet/giftSet";
import type { TranslationDictionary } from "@/lib/i18n/types";
import type { ProductType } from "@/lib/validations";

/**
 * A product type, UV-DTF stickers (UV print with technique «transfer») shown
 * apart, «Набор» (a gift set: the ready-set line, the wizard menu tile, the badge),
 * or the box line of a set (no print: packaging written off with the set).
 */
export type LineTypeKey = ProductType | "uv_dtf" | "gift_set" | "set_box";

/**
 * The one icon per product type, used by order line headers, the workshop
 * board, the wizard product menu and the cabinet. No two keys share an icon.
 */
export const PRODUCT_TYPE_ICONS: Record<LineTypeKey, LucideIcon> = {
  paper_print: FileText,
  mug: Coffee,
  notebook: Notebook,
  pen: PenLine,
  large_format_print: Maximize,
  business_card: Contact,
  flyer: Newspaper,
  sticker_sheet: Sticker,
  postcard: Mail,
  dtf_apparel: Shirt,
  uv_print: Sparkles,
  uv_dtf: StickyNote,
  sublimation_print: Flame,
  gift_set: Gift,
  set_box: Package,
};

/** Orders made of several product types (cabinet order header). */
export const MIXED_PRODUCT_ICON: LucideIcon = Layers;

/**
 * UV-DTF stickers are UV lines with the transfer technique (or the sticker
 * source); a ready gift set (one UV line on the set item) is «Набор».
 */
export function lineTypeKey(productType: string, uvLineDataRaw?: unknown, setDataRaw?: unknown): LineTypeKey | null {
  // Legacy ready set (one UV line for the whole set C); new ones are one line per item.
  if (productType === "uv_print" && isLegacyReadySetLine(parseOrderLineSetData(setDataRaw))) return "gift_set";
  if (productType === "uv_print") {
    const uv = parseUvLineData(uvLineDataRaw);
    if (uv && (uv.technique === "transfer" || uv.source === "stickers")) return "uv_dtf";
  }
  return productType in PRODUCT_TYPE_ICONS ? (productType as LineTypeKey) : null;
}

/** Human label of a line type in the current language. */
export function lineTypeLabel(key: LineTypeKey, t: TranslationDictionary): string {
  switch (key) {
    case "paper_print": return t.mug.productPaperPrint;
    case "mug": return t.mug.productMug;
    case "notebook": return t.notebook.productNotebook;
    case "pen": return t.admin.productTypePen;
    case "large_format_print": return t.admin.productTypeLargeFormat;
    case "business_card": return t.admin.productTypeBusinessCard;
    case "flyer": return t.admin.productTypeFlyer;
    case "sticker_sheet": return t.admin.productTypeStickerSheet;
    case "postcard": return t.admin.productTypePostcard;
    case "dtf_apparel": return t.dtf.productType;
    case "uv_print": return t.uv.productType;
    case "uv_dtf": return t.uv.workshop.sectionUvDtf;
    case "sublimation_print": return t.sublimation.productType;
    case "gift_set": return t.giftSet.typeLabel;
    case "set_box": return t.giftSet.boxTypeLabel;
  }
}
