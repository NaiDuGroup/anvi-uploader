import "server-only";

/** Catalog fields needed to label a design and show its product thumbnail. */
export const DESIGN_MUG_PRODUCT_SELECT = {
  select: { sku: true, nameRu: true, imageUrl: true, bodyColorHex: true },
} as const;

export const DESIGN_NOTEBOOK_PRODUCT_SELECT = {
  select: { sku: true, nameRu: true, imageUrl: true, coverColorHex: true },
} as const;

export const DESIGN_PRODUCT_INCLUDE = {
  mugProduct: DESIGN_MUG_PRODUCT_SELECT,
  notebookProduct: DESIGN_NOTEBOOK_PRODUCT_SELECT,
} as const;
