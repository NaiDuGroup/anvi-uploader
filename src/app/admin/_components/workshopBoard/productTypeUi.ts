import type { LucideIcon } from "lucide-react";
import { PRODUCT_TYPE_ICONS } from "@/lib/productTypeIcons";
import type { TranslationDictionary } from "@/lib/i18n/types";
import type { BoardSectionKey } from "@/lib/workshopBoard/types";

/**
 * Everything the workshop board needs to draw a section (a product type, or
 * UV-DTF stickers split off UV print). A new `ProductType` fails to compile
 * until it gets an entry here.
 */
export interface ProductTypeUi {
  icon: LucideIcon;
  label: (t: TranslationDictionary) => string;
  /** Section header: border, background and text. */
  sectionClass: string;
  /** Left accent of group cards. */
  groupBorderClass: string;
  /** Overview tile accent: icon tint and the ring when selected. */
  accentTextClass: string;
  activeRingClass: string;
}

export const PRODUCT_TYPE_UI: Record<BoardSectionKey, ProductTypeUi> = {
  large_format_print: {
    icon: PRODUCT_TYPE_ICONS.large_format_print,
    label: (t) => t.workshopBoard.sectionLf,
    sectionClass: "border-sky-200 bg-sky-50 text-sky-900",
    groupBorderClass: "border-l-sky-400",
    accentTextClass: "text-sky-600 bg-sky-50",
    activeRingClass: "ring-sky-400 border-sky-300",
  },
  business_card: {
    icon: PRODUCT_TYPE_ICONS.business_card,
    label: (t) => t.workshopBoard.sectionBusinessCard,
    sectionClass: "border-teal-200 bg-teal-50 text-teal-900",
    groupBorderClass: "border-l-teal-400",
    accentTextClass: "text-teal-600 bg-teal-50",
    activeRingClass: "ring-teal-400 border-teal-300",
  },
  flyer: {
    icon: PRODUCT_TYPE_ICONS.flyer,
    label: (t) => t.workshopBoard.sectionFlyer,
    sectionClass: "border-orange-200 bg-orange-50 text-orange-900",
    groupBorderClass: "border-l-orange-400",
    accentTextClass: "text-orange-600 bg-orange-50",
    activeRingClass: "ring-orange-400 border-orange-300",
  },
  sticker_sheet: {
    icon: PRODUCT_TYPE_ICONS.sticker_sheet,
    label: (t) => t.workshopBoard.sectionStickerSheet,
    sectionClass: "border-lime-200 bg-lime-50 text-lime-900",
    groupBorderClass: "border-l-lime-400",
    accentTextClass: "text-lime-700 bg-lime-50",
    activeRingClass: "ring-lime-400 border-lime-300",
  },
  mug: {
    icon: PRODUCT_TYPE_ICONS.mug,
    label: (t) => t.workshopBoard.sectionMug,
    sectionClass: "border-amber-200 bg-amber-50 text-amber-900",
    groupBorderClass: "border-l-amber-400",
    accentTextClass: "text-amber-600 bg-amber-50",
    activeRingClass: "ring-amber-400 border-amber-300",
  },
  notebook: {
    icon: PRODUCT_TYPE_ICONS.notebook,
    label: (t) => t.workshopBoard.sectionNotebook,
    sectionClass: "border-emerald-200 bg-emerald-50 text-emerald-900",
    groupBorderClass: "border-l-emerald-400",
    accentTextClass: "text-emerald-600 bg-emerald-50",
    activeRingClass: "ring-emerald-400 border-emerald-300",
  },
  pen: {
    icon: PRODUCT_TYPE_ICONS.pen,
    label: (t) => t.workshopBoard.sectionPen,
    sectionClass: "border-pink-200 bg-pink-50 text-pink-900",
    groupBorderClass: "border-l-pink-400",
    accentTextClass: "text-pink-600 bg-pink-50",
    activeRingClass: "ring-pink-400 border-pink-300",
  },
  dtf_apparel: {
    icon: PRODUCT_TYPE_ICONS.dtf_apparel,
    label: (t) => t.dtf.workshop.section,
    sectionClass: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-900",
    groupBorderClass: "border-l-fuchsia-400",
    accentTextClass: "text-fuchsia-600 bg-fuchsia-50",
    activeRingClass: "ring-fuchsia-400 border-fuchsia-300",
  },
  uv_print: {
    icon: PRODUCT_TYPE_ICONS.uv_print,
    label: (t) => t.uv.workshop.section,
    sectionClass: "border-indigo-200 bg-indigo-50 text-indigo-900",
    groupBorderClass: "border-l-indigo-400",
    accentTextClass: "text-indigo-600 bg-indigo-50",
    activeRingClass: "ring-indigo-400 border-indigo-300",
  },
  uv_dtf: {
    icon: PRODUCT_TYPE_ICONS.uv_dtf,
    label: (t) => t.uv.workshop.sectionUvDtf,
    sectionClass: "border-cyan-200 bg-cyan-50 text-cyan-900",
    groupBorderClass: "border-l-cyan-400",
    accentTextClass: "text-cyan-600 bg-cyan-50",
    activeRingClass: "ring-cyan-400 border-cyan-300",
  },
  sublimation_print: {
    icon: PRODUCT_TYPE_ICONS.sublimation_print,
    label: (t) => t.sublimation.workshop.section,
    sectionClass: "border-amber-200 bg-amber-50 text-amber-900",
    groupBorderClass: "border-l-amber-400",
    accentTextClass: "text-amber-700 bg-amber-50",
    activeRingClass: "ring-amber-400 border-amber-300",
  },
  paper_print: {
    icon: PRODUCT_TYPE_ICONS.paper_print,
    label: (t) => t.workshopBoard.sectionPaper,
    sectionClass: "border-violet-200 bg-violet-50 text-violet-900",
    groupBorderClass: "border-l-violet-400",
    accentTextClass: "text-violet-600 bg-violet-50",
    activeRingClass: "ring-violet-400 border-violet-300",
  },
};
