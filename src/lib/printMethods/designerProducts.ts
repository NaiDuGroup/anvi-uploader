import type { ProductType } from "@/lib/validations";

/**
 * Stage E of the print-methods plan: pens, notebooks and mugs keep their own
 * order lines (designer, layout, snapshots, per-piece price with print), but the
 * admin order editor reaches them through their print method — picking a pen or
 * a notebook in «UV-печать», or a mug in «Сублимация», turns the line into that
 * product. Pure; shared by the editor and its tests.
 */

/** Order products that keep their own designer line. */
export type DesignerProductType = "pen" | "notebook" | "mug";

/** Print-method products whose stock picker can lead to a designer line. */
export type DesignerPrintMethod = "uv_print" | "sublimation_print";

export const DESIGNER_PRODUCT_TYPES: readonly DesignerProductType[] = ["pen", "notebook", "mug"];

/** Stock category code → designer product, per print method (same codes as the dedicated catalog pages). */
export const DESIGNER_PRODUCT_BY_CATEGORY: Readonly<
  Record<DesignerPrintMethod, Readonly<Record<string, DesignerProductType>>>
> = {
  uv_print: { pens: "pen", notebooks: "notebook" },
  sublimation_print: { mugs: "mug" },
};

const METHOD_BY_DESIGNER_PRODUCT: Readonly<Record<DesignerProductType, DesignerPrintMethod>> = {
  pen: "uv_print",
  notebook: "uv_print",
  mug: "sublimation_print",
};

export function isDesignerProductType(productType: string): productType is DesignerProductType {
  return (DESIGNER_PRODUCT_TYPES as readonly string[]).includes(productType);
}

export function isDesignerPrintMethod(productType: string): productType is DesignerPrintMethod {
  return productType === "uv_print" || productType === "sublimation_print";
}

/** Designer product for a stock category picked in a print-method line, or null (the method's own editor). */
export function designerProductForCategory(
  method: DesignerPrintMethod,
  categoryCode: string | null | undefined,
): DesignerProductType | null {
  if (!categoryCode) return null;
  const byCategory = DESIGNER_PRODUCT_BY_CATEGORY[method];
  return Object.prototype.hasOwnProperty.call(byCategory, categoryCode) ? byCategory[categoryCode]! : null;
}

/** Print method a designer product is printed with (pen / notebook → UV, mug → sublimation). */
export function printMethodForDesignerProduct(productType: ProductType): DesignerPrintMethod | null {
  return isDesignerProductType(productType) ? METHOD_BY_DESIGNER_PRODUCT[productType] : null;
}

/** Product-type selector value for a line: designer lines are shown under their print method. */
export function adminProductMenuValue(productType: ProductType): ProductType {
  return printMethodForDesignerProduct(productType) ?? productType;
}

/** Products offered for admin order lines: designer products are reached via their print method instead. */
export function adminLineProductTypes(all: readonly ProductType[]): ProductType[] {
  return all.filter((pt) => !isDesignerProductType(pt));
}
