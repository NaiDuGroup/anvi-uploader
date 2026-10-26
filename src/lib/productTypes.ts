import type { LucideIcon } from "lucide-react";
import { BookOpen, Coffee, CreditCard, Newspaper, Pencil, Printer, Sparkles, Stamp, Upload } from "lucide-react";
import { PRODUCT_PICKER_GROUP_ORDER, ProductPickerGroup } from "./productPickerGroup";
import type { ProductType } from "./validations";
import type { TranslationDictionary } from "./i18n/types";

export { PRODUCT_PICKER_GROUP_ORDER, ProductPickerGroup };

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
  pickerGroup: ProductPickerGroup;
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
    pickerGroup: ProductPickerGroup.Print,
    isCustomized: false,
    modes: [],
  },
  {
    id: "mug",
    dbProductType: "mug",
    icon: Coffee,
    accent: GOLD_ACCENT,
    getTitle: (t) => t.mug.productMug,
    getHint: (t) => t.mug.mugDesignerHint,
    categories: ["souvenirs"],
    pickerGroup: ProductPickerGroup.Souvenir,
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
    pickerGroup: ProductPickerGroup.Souvenir,
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
    id: "pen",
    dbProductType: "pen",
    icon: Pencil,
    accent: GOLD_ACCENT,
    getTitle: (t) => t.pen?.productPen ?? "Pix",
    getHint: (t) => t.pen?.penEditorHint ?? "Design personalizat pentru pixuri",
    categories: ["merch", "stationery"],
    pickerGroup: ProductPickerGroup.Souvenir,
    isCustomized: true,
    modes: [
      {
        id: "editor",
        icon: Pencil,
        getTitle: (t) => t.pen?.penModeEditor ?? "Editor 2D",
        getHint: (t) => t.pen?.penEditorHint ?? "Design 2D pentru pixuri",
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
    pickerGroup: ProductPickerGroup.Print,
    isCustomized: false,
    modes: [],
  },
  {
    id: "business_card",
    dbProductType: "business_card",
    icon: CreditCard,
    accent: GOLD_ACCENT,
    getTitle: (t) => t.admin.productTypeBusinessCard,
    getHint: (t) => t.admin.productTypeBusinessCardHint,
    categories: ["polygraphy"],
    pickerGroup: ProductPickerGroup.Print,
    isCustomized: false,
    modes: [],
  },
  {
    id: "flyer",
    dbProductType: "flyer",
    icon: Newspaper,
    accent: GOLD_ACCENT,
    getTitle: (t) => t.admin.productTypeFlyer,
    getHint: (t) => t.admin.productTypeFlyerHint,
    categories: ["polygraphy"],
    pickerGroup: ProductPickerGroup.Print,
    isCustomized: false,
    modes: [],
  },
  {
    // Listed last among souvenirs, right before DTF in the textile group.
    id: "uv_print",
    dbProductType: "uv_print",
    icon: Sparkles,
    accent: GOLD_ACCENT,
    getTitle: (t) => t.uv.productType,
    getHint: (t) => t.uv.productTypeHint,
    categories: ["merch", "stationery", "souvenirs"],
    pickerGroup: ProductPickerGroup.Souvenir,
    isCustomized: false,
    modes: [],
  },
  {
    id: "dtf_apparel",
    dbProductType: "dtf_apparel",
    icon: Stamp,
    accent: GOLD_ACCENT,
    getTitle: (t) => t.dtf.productType,
    getHint: (t) => t.dtf.productTypeHint,
    categories: ["textile"],
    pickerGroup: ProductPickerGroup.Textile,
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

export interface ProductPickerItem {
  config: ProductTypeConfig;
  title: string;
  hint: string;
}

export interface ProductPickerSection {
  group: ProductPickerGroup;
  items: ProductPickerItem[];
}

/**
 * Order wizard product menu: the given product types grouped in picker order,
 * filtered by `query` against title and hint. Empty groups are dropped.
 */
export function buildProductPickerSections(
  productTypes: readonly ProductType[],
  t: TranslationDictionary,
  query: string,
): ProductPickerSection[] {
  const needle: string = query.trim().toLocaleLowerCase();
  const items: ProductPickerItem[] = productTypes
    .map((id) => PRODUCT_TYPE_CONFIGS.find((c) => c.dbProductType === id))
    .filter((config): config is ProductTypeConfig => config !== undefined)
    .map((config) => ({ config, title: config.getTitle(t), hint: config.getHint(t) }))
    .filter(
      (item) =>
        needle === "" ||
        item.title.toLocaleLowerCase().includes(needle) ||
        item.hint.toLocaleLowerCase().includes(needle),
    );
  return PRODUCT_PICKER_GROUP_ORDER.map((group) => ({
    group,
    items: items.filter((item) => item.config.pickerGroup === group),
  })).filter((section) => section.items.length > 0);
}
