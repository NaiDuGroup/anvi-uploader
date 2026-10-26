/**
 * Admin order editor, stage E: pen / notebook / mug lines are reached through
 * «UV-печать» and «Сублимация». Picking a stock item whose category has a
 * designer turns the row into that product's line (exactly today's pen /
 * notebook / mug line), and picking any other item turns it back into the
 * print-method line. Pure — the editor and the tests share it.
 */
import type {
  AdminOrderLineInput,
  AdminOrderUpdateLineInput,
  MugLayoutData,
  NotebookLayoutData,
  PenLayoutData,
  ProductType,
} from "@/lib/validations";
import {
  designerProductForCategory,
  isDesignerProductType,
  type DesignerPrintMethod,
  type DesignerProductType,
} from "@/lib/printMethods/designerProducts";
import type { UvCatalogJson, UvStockItemJson } from "@/lib/uv/dto";
import { emptyUvDraft, uvDraftQuantity, withUvItem, type UvDraft } from "@/lib/uv/uvDraft";
import type { SublimationCatalogJson } from "@/lib/sublimation/dto";
import {
  emptySublimationDraft,
  sublimationDraftQuantity,
  type SublimationDraft,
} from "@/lib/sublimation/sublimationDraft";
import {
  minimalUploadReadyMugLayout,
  minimalUploadReadyNotebookLayout,
  minimalUploadReadyPenLayout,
} from "./adminWizardLayoutPrepare";

export type DesignerCatalogPick = { type: "catalog"; productId: string } | { type: "other" } | null;

/** The part of a wizard row this module reads and writes. */
export interface DesignerConvertibleAssign {
  productType: ProductType;
  copiesStr: string;
  linePriceStr: string;
  mugPick: DesignerCatalogPick;
  nbPick: DesignerCatalogPick;
  penPick: DesignerCatalogPick;
  mugLayoutData?: MugLayoutData | null;
  notebookLayoutData?: NotebookLayoutData | null;
  penLayoutData?: PenLayoutData | null;
  mugProductSnapshot?: Record<string, unknown> | null;
  notebookProductSnapshot?: Record<string, unknown> | null;
  penProductSnapshot?: Record<string, unknown> | null;
  uv: UvDraft | null;
  sublimation: SublimationDraft | null;
  designId: string | null;
}

export interface DesignerLineCatalogs {
  uv: UvCatalogJson;
  sublimation: SublimationCatalogJson;
}

/** Item chosen in a print-method picker: a stock variant, or (UV only) the client's own item. */
export type PrintMethodItemPick = { source: "stock"; variantId: string } | { source: "client" };

const PICK_FIELD = { pen: "penPick", notebook: "nbPick", mug: "mugPick" } as const;

function methodItems(catalogs: DesignerLineCatalogs, method: DesignerPrintMethod): readonly UvStockItemJson[] {
  return method === "uv_print" ? catalogs.uv.items : catalogs.sublimation.items;
}

/** Designer product of a stock variant offered by the print method, or null. */
export function designerProductForVariant(
  catalogs: DesignerLineCatalogs,
  method: DesignerPrintMethod,
  variantId: string | null | undefined,
): DesignerProductType | null {
  if (!variantId) return null;
  const item = methodItems(catalogs, method).find((i) => i.id === variantId);
  return item ? designerProductForCategory(method, item.categoryCode) : null;
}

/** Stock variant a designer row was picked with (null for «other» / no pick). */
export function designerRowVariantId(a: DesignerConvertibleAssign): string | null {
  if (!isDesignerProductType(a.productType)) return null;
  const pick: DesignerCatalogPick = a[PICK_FIELD[a.productType]];
  return pick?.type === "catalog" ? pick.productId : null;
}

function positiveInt(value: string): number {
  const n: number = Number.parseInt(value.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Row without anything a designer line keeps (layouts, snapshots). */
function withoutDesignerData<T extends DesignerConvertibleAssign>(a: T): T {
  return {
    ...a,
    mugLayoutData: undefined,
    notebookLayoutData: undefined,
    penLayoutData: undefined,
    mugProductSnapshot: null,
    notebookProductSnapshot: null,
    penProductSnapshot: null,
  };
}

/** Pieces the row currently asks for, whatever its type (at least 1). */
function rowQuantity(a: DesignerConvertibleAssign): number {
  if (a.productType === "uv_print" && a.uv) return Math.max(1, uvDraftQuantity(a.uv));
  if (a.productType === "sublimation_print" && a.sublimation) {
    return Math.max(1, sublimationDraftQuantity(a.sublimation));
  }
  return Math.max(1, positiveInt(a.copiesStr));
}

/**
 * The row as a fresh designer line for `variantId` — the same state as picking
 * that product in the old product menu and that SKU in its catalog. Quantity
 * carries over; the print-method drafts and any earlier layout are dropped.
 */
export function toDesignerLine<T extends DesignerConvertibleAssign>(
  a: T,
  product: DesignerProductType,
  variantId: string,
): T {
  return {
    ...withoutDesignerData(a),
    productType: product,
    copiesStr: String(rowQuantity(a)),
    linePriceStr: "",
    [PICK_FIELD[product]]: { type: "catalog", productId: variantId },
    uv: null,
    sublimation: null,
  };
}

/** First item of the method without a designer (the print-method editor's own default). */
function firstGenericItem(items: readonly UvStockItemJson[], method: DesignerPrintMethod): UvStockItemJson | undefined {
  return items.find((i) => designerProductForCategory(method, i.categoryCode) === null);
}

/** New UV draft for the wizard: the first non-designer stock item, else the client's own item. */
export function emptyWizardUvDraft(catalog: UvCatalogJson): UvDraft {
  const draft: UvDraft = emptyUvDraft(catalog);
  const generic = firstGenericItem(catalog.items, "uv_print");
  return generic
    ? { ...draft, source: "stock", variantId: generic.id }
    : { ...draft, source: "client", variantId: null };
}

/** New sublimation draft for the wizard: the first non-mug blank, else the first blank. */
export function emptyWizardSublimationDraft(catalog: SublimationCatalogJson): SublimationDraft {
  const draft: SublimationDraft = emptySublimationDraft(catalog);
  const generic = firstGenericItem(catalog.items, "sublimation_print");
  return generic ? { ...draft, variantId: generic.id } : draft;
}

/**
 * The row as a print-method line with the picked item. A row that already is
 * that method keeps its draft (zones, quantity); any other row starts a fresh
 * draft with its quantity. Designer data is dropped.
 */
export function toPrintMethodLine<T extends DesignerConvertibleAssign>(
  a: T,
  method: DesignerPrintMethod,
  pick: PrintMethodItemPick,
  catalogs: DesignerLineCatalogs,
): T {
  const sameMethod: boolean = a.productType === method;
  const quantityStr: string = String(rowQuantity(a));
  const cleared: T = withoutDesignerData(a);
  if (method === "uv_print") {
    const base: UvDraft =
      sameMethod && a.uv ? a.uv : { ...emptyWizardUvDraft(catalogs.uv), quantityStr };
    const uv: UvDraft = withUvItem(base, catalogs.uv, pick.source, pick.source === "stock" ? pick.variantId : null);
    return {
      ...cleared,
      productType: "uv_print",
      copiesStr: String(Math.max(1, uvDraftQuantity(uv))),
      linePriceStr: sameMethod ? a.linePriceStr : "",
      uv,
      sublimation: null,
    };
  }
  const base: SublimationDraft =
    sameMethod && a.sublimation ? a.sublimation : { ...emptyWizardSublimationDraft(catalogs.sublimation), quantityStr };
  const sublimation: SublimationDraft = { ...base, variantId: pick.source === "stock" ? pick.variantId : base.variantId };
  return {
    ...cleared,
    productType: "sublimation_print",
    copiesStr: String(Math.max(1, sublimationDraftQuantity(sublimation))),
    linePriceStr: sameMethod ? a.linePriceStr : "",
    uv: null,
    sublimation,
  };
}

/**
 * Item picked in the print-method header of a row (any current type): a
 * designer category → that designer line (same designer: only the SKU
 * changes, like the catalog modal); anything else → the print-method line.
 */
export function pickPrintMethodItem<T extends DesignerConvertibleAssign>(
  a: T,
  method: DesignerPrintMethod,
  pick: PrintMethodItemPick,
  catalogs: DesignerLineCatalogs,
): T {
  const designer: DesignerProductType | null =
    pick.source === "stock" ? designerProductForVariant(catalogs, method, pick.variantId) : null;
  if (designer && pick.source === "stock") {
    if (a.productType === designer) {
      return { ...a, [PICK_FIELD[designer]]: { type: "catalog", productId: pick.variantId } };
    }
    return toDesignerLine(a, designer, pick.variantId);
  }
  return toPrintMethodLine(a, method, pick, catalogs);
}

/**
 * After an edit of a UV / sublimation row: when the operator has just picked a
 * stock item with a designer (a new item, not a quantity or zone change), the
 * row becomes that designer line. Saved stage-C/D rows are left alone until
 * their item is changed.
 */
export function convertPickedDesignerItem<T extends DesignerConvertibleAssign>(
  prev: DesignerConvertibleAssign | undefined,
  next: T,
  catalogs: DesignerLineCatalogs,
): T {
  if (next.productType === "uv_print" && next.uv?.source === "stock" && next.uv.variantId) {
    const picked: boolean =
      prev?.productType !== "uv_print" || prev.uv?.source !== "stock" || prev.uv.variantId !== next.uv.variantId;
    const designer = picked ? designerProductForVariant(catalogs, "uv_print", next.uv.variantId) : null;
    return designer ? toDesignerLine(next, designer, next.uv.variantId) : next;
  }
  if (next.productType === "sublimation_print" && next.sublimation?.variantId) {
    const picked: boolean =
      prev?.productType !== "sublimation_print" || prev.sublimation?.variantId !== next.sublimation.variantId;
    const designer = picked ? designerProductForVariant(catalogs, "sublimation_print", next.sublimation.variantId) : null;
    return designer ? toDesignerLine(next, designer, next.sublimation.variantId) : next;
  }
  return next;
}

/** POST line of a new designer row (mug / notebook / pen) — the request body the old product menu built. */
export function designerCreateLine(
  a: DesignerConvertibleAssign,
  file: { fileName: string; fileUrl: string },
  copies: number,
): AdminOrderLineInput {
  const files: AdminOrderLineInput["files"] = [
    { fileName: file.fileName, fileUrl: file.fileUrl, copies, color: "color" },
  ];
  const designId: string | undefined = a.designId ?? undefined;
  if (a.productType === "mug") {
    return {
      productType: "mug",
      mugLayoutData: a.mugLayoutData ?? minimalUploadReadyMugLayout(),
      mugOther: a.mugPick?.type === "other",
      mugProductId: a.mugPick?.type === "catalog" ? a.mugPick.productId : undefined,
      designId,
      files,
    };
  }
  if (a.productType === "notebook") {
    return {
      productType: "notebook",
      notebookLayoutData: a.notebookLayoutData ?? minimalUploadReadyNotebookLayout(),
      notebookOther: a.nbPick?.type === "other",
      notebookProductId: a.nbPick?.type === "catalog" ? a.nbPick.productId : undefined,
      designId,
      files,
    };
  }
  if (a.productType === "pen") {
    return {
      productType: "pen",
      penLayoutData: a.penLayoutData ?? minimalUploadReadyPenLayout(),
      penOther: a.penPick?.type === "other",
      penProductId: a.penPick?.type === "catalog" ? a.penPick.productId : undefined,
      designId,
      files,
    };
  }
  throw new Error("Not a designer line");
}

/** Designer fields of a PATCH line (undefined / false for other products). */
export function designerUpdateLineFields(
  a: DesignerConvertibleAssign,
): Pick<
  AdminOrderUpdateLineInput,
  | "mugLayoutData"
  | "mugProductId"
  | "mugOther"
  | "notebookLayoutData"
  | "notebookProductId"
  | "notebookOther"
  | "penLayoutData"
  | "penProductId"
  | "penOther"
> {
  const pt: ProductType = a.productType;
  return {
    mugLayoutData: pt === "mug" ? (a.mugLayoutData ?? undefined) : undefined,
    mugProductId: pt === "mug" && a.mugPick?.type === "catalog" ? a.mugPick.productId : undefined,
    mugOther: pt === "mug" && a.mugPick?.type === "other",
    notebookLayoutData: pt === "notebook" ? (a.notebookLayoutData ?? undefined) : undefined,
    notebookProductId: pt === "notebook" && a.nbPick?.type === "catalog" ? a.nbPick.productId : undefined,
    notebookOther: pt === "notebook" && a.nbPick?.type === "other",
    penLayoutData: pt === "pen" ? (a.penLayoutData ?? undefined) : undefined,
    penProductId: pt === "pen" && a.penPick?.type === "catalog" ? a.penPick.productId : undefined,
    penOther: pt === "pen" && a.penPick?.type === "other",
  };
}
