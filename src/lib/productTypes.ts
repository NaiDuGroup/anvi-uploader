import type { LucideIcon } from "lucide-react";
import { BookOpen, Pencil, Printer, Upload } from "lucide-react";
import type { ProductType } from "./validations";
import type { TranslationDictionary } from "./i18n/types";

/**
 * Mode within a customized product (e.g. mug → editor / upload-ready-layout).
 * Non-customized products (paper print, future pen) have no mode.
 */
export type ProductMode = "editor" | "upload";

/**
 * Stable category ids, used for future grouping/filtering in the picker.
 * Add new ones here when expanding the catalog (e.g. "textile" for tshirts).
 */
export const PRODUCT_CATEGORY_IDS = [
  "polygraphy",
  "souvenirs",
  "textile",
  "merch",
  "stationery",
] as const;
export type ProductCategoryId = (typeof PRODUCT_CATEGORY_IDS)[number];

export interface ProductTypeMode {
  id: ProductMode;
  icon: LucideIcon;
  getTitle: (t: TranslationDictionary) => string;
  getHint: (t: TranslationDictionary) => string;
}

export interface ProductTypeAccent {
  /** Background tint applied to the icon chip when active. */
  bgActive: string;
  /** Border applied to the picker card when active. */
  borderActive: string;
  /** Foreground/text color used in the active state. */
  textActive: string;
  /** Subtle ring used for focus / active emphasis. */
  ringActive: string;
}

export interface ProductTypeConfig {
  /** Stable id used in URLs and analytics. Matches `dbProductType` for now. */
  id: string;
  /** Value persisted to `Order.productType`. */
  dbProductType: ProductType;
  icon: LucideIcon;
  /** Tailwind classes for active/selected states. */
  accent: ProductTypeAccent;
  getTitle: (t: TranslationDictionary) => string;
  getHint: (t: TranslationDictionary) => string;
  /** Forward-looking grouping. Picker UI ignores this until categories are needed. */
  categories: readonly ProductCategoryId[];
  /** True when product has a designable layout (mug, notebook, future tshirt). */
  isCustomized: boolean;
  /** Empty for non-customized products; one or more for customized. */
  modes: readonly ProductTypeMode[];
}

const GOLD_ACCENT: ProductTypeAccent = {
  bgActive: "bg-gold-light",
  borderActive: "border-gold",
  textActive: "text-gold-text",
  ringActive: "ring-gold/20",
};

export const PRODUCT_TYPE_CONFIGS: readonly ProductTypeConfig[] = [
  {
    id: "paper_print",
    dbProductType: "paper_print",
    icon: Printer,
    accent: GOLD_ACCENT,
    getTitle: (t) => t.mug.productPaperPrint,
    getHint: (t) => t.mug.productPaperPrintHint,
    categories: ["polygraphy"],
    isCustomized: false,
    modes: [],
  },
  {
    id: "mug",
    dbProductType: "mug",
    icon: BookOpen,
    accent: GOLD_ACCENT,
    getTitle: (t) => t.mug.productMug,
    getHint: (t) => t.mug.mugDesignerHint,
    categories: ["souvenirs"],
    isCustomized: true,
    modes: [
      {
        id: "editor",
        icon: Pencil,
        getTitle: (t) => t.mug.mugModeEditor,
        getHint: (t) => t.mug.mugDesignerHint,
      },
      {
        id: "upload",
        icon: Upload,
        getTitle: (t) => t.mug.mugModeUpload,
        getHint: (t) => t.mug.mugUploadHint,
      },
    ],
  },
  {
    id: "notebook",
    dbProductType: "notebook",
    icon: BookOpen,
    accent: GOLD_ACCENT,
    getTitle: (t) => t.notebook.productNotebook,
    getHint: (t) => t.notebook.notebookDesignerHint,
    categories: ["souvenirs", "stationery"],
    isCustomized: true,
    modes: [
      {
        id: "editor",
        icon: Pencil,
        getTitle: (t) => t.notebook.notebookModeEditor,
        getHint: (t) => t.notebook.notebookDesignerHint,
      },
      {
        id: "upload",
        icon: Upload,
        getTitle: (t) => t.notebook.notebookModeUpload,
        getHint: (t) => t.notebook.uploadLayoutHint,
      },
    ],
  },
  {
    id: "large_format_print",
    dbProductType: "large_format_print",
    icon: Printer,
    accent: GOLD_ACCENT,
    getTitle: (t) => t.admin.productTypeLargeFormat,
    getHint: (t) => t.admin.productTypeLargeFormat,
    categories: ["polygraphy"],
    isCustomized: false,
    modes: [],
  },
];

export function getProductTypeConfig(id: string): ProductTypeConfig | undefined {
  return PRODUCT_TYPE_CONFIGS.find((c) => c.id === id);
}

export interface PickerEntry {
  /** Stable composite key for React lists (`paper_print`, `mug__editor`, …). */
  key: string;
  product: ProductTypeConfig;
  /** Present only when the entry represents a (product, mode) pair. */
  mode?: ProductTypeMode;
}

/**
 * Flatten the registry into the leaf entries that the modal/page actually
 * renders today: products without modes appear once, products with modes
 * appear once per mode. This mirrors the legacy 5-card grid (paper, mug-editor,
 * mug-upload, notebook-editor, notebook-upload) without hardcoding the count.
 */
export function buildPickerEntries(): PickerEntry[] {
  const out: PickerEntry[] = [];
  for (const product of PRODUCT_TYPE_CONFIGS) {
    if (product.modes.length === 0) {
      out.push({ key: product.id, product });
      continue;
    }
    for (const mode of product.modes) {
      out.push({ key: `${product.id}__${mode.id}`, product, mode });
    }
  }
  return out;
}

export function buildEntryLabel(
  entry: PickerEntry,
  t: TranslationDictionary,
): string {
  if (!entry.mode) return entry.product.getTitle(t);
  return `${entry.product.getTitle(t)} — ${entry.mode.getTitle(t)}`;
}

export function buildEntryHint(
  entry: PickerEntry,
  t: TranslationDictionary,
): string {
  if (entry.mode) return entry.mode.getHint(t);
  return entry.product.getHint(t);
}

export function getEntryIcon(entry: PickerEntry): LucideIcon {
  return entry.mode?.icon ?? entry.product.icon;
}
