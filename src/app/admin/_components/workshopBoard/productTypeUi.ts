import {
  BookOpen,
  Coffee,
  CreditCard,
  FileText,
  Newspaper,
  Pencil,
  ScanLine,
  Stamp,
  type LucideIcon,
} from "lucide-react";
import type { TranslationDictionary } from "@/lib/i18n/types";
import type { ProductType } from "@/lib/validations";

/**
 * Everything the workshop board needs to draw a product type. A new
 * `ProductType` fails to compile until it gets an entry here.
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

export const PRODUCT_TYPE_UI: Record<ProductType, ProductTypeUi> = {
  large_format_print: {
    icon: ScanLine,
    label: (t) => t.workshopBoard.sectionLf,
    sectionClass: "border-sky-200 bg-sky-50 text-sky-900",
    groupBorderClass: "border-l-sky-400",
    accentTextClass: "text-sky-600 bg-sky-50",
    activeRingClass: "ring-sky-400 border-sky-300",
  },
  business_card: {
    icon: CreditCard,
    label: (t) => t.workshopBoard.sectionBusinessCard,
    sectionClass: "border-teal-200 bg-teal-50 text-teal-900",
    groupBorderClass: "border-l-teal-400",
    accentTextClass: "text-teal-600 bg-teal-50",
    activeRingClass: "ring-teal-400 border-teal-300",
  },
  flyer: {
    icon: Newspaper,
    label: (t) => t.workshopBoard.sectionFlyer,
    sectionClass: "border-orange-200 bg-orange-50 text-orange-900",
    groupBorderClass: "border-l-orange-400",
    accentTextClass: "text-orange-600 bg-orange-50",
    activeRingClass: "ring-orange-400 border-orange-300",
  },
  mug: {
    icon: Coffee,
    label: (t) => t.workshopBoard.sectionMug,
    sectionClass: "border-amber-200 bg-amber-50 text-amber-900",
    groupBorderClass: "border-l-amber-400",
    accentTextClass: "text-amber-600 bg-amber-50",
    activeRingClass: "ring-amber-400 border-amber-300",
  },
  notebook: {
    icon: BookOpen,
    label: (t) => t.workshopBoard.sectionNotebook,
    sectionClass: "border-emerald-200 bg-emerald-50 text-emerald-900",
    groupBorderClass: "border-l-emerald-400",
    accentTextClass: "text-emerald-600 bg-emerald-50",
    activeRingClass: "ring-emerald-400 border-emerald-300",
  },
  pen: {
    icon: Pencil,
    label: (t) => t.workshopBoard.sectionPen,
    sectionClass: "border-pink-200 bg-pink-50 text-pink-900",
    groupBorderClass: "border-l-pink-400",
    accentTextClass: "text-pink-600 bg-pink-50",
    activeRingClass: "ring-pink-400 border-pink-300",
  },
  dtf_apparel: {
    icon: Stamp,
    label: (t) => t.dtf.workshop.section,
    sectionClass: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-900",
    groupBorderClass: "border-l-fuchsia-400",
    accentTextClass: "text-fuchsia-600 bg-fuchsia-50",
    activeRingClass: "ring-fuchsia-400 border-fuchsia-300",
  },
  paper_print: {
    icon: FileText,
    label: (t) => t.workshopBoard.sectionPaper,
    sectionClass: "border-violet-200 bg-violet-50 text-violet-900",
    groupBorderClass: "border-l-violet-400",
    accentTextClass: "text-violet-600 bg-violet-50",
    activeRingClass: "ring-violet-400 border-violet-300",
  },
};
