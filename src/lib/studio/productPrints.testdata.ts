/** Test data shared by the template tests. */

/** Print areas of the products on sale (catalog rows): a real pen prints only ~6 mm high. */
export const STUDIO_PRODUCT_PRINTS = {
  mug: [{ widthCm: 21, heightCm: 7, dpi: 300 }, { widthCm: 21, heightCm: 9.6, dpi: 300 }],
  notebook: [{ widthCm: 14, heightCm: 21.4, dpi: 300 }, { widthCm: 14.5, heightCm: 21, dpi: 300 }],
  pen: [{ widthCm: 5, heightCm: 0.6, dpi: 300 }, { widthCm: 4, heightCm: 1.5, dpi: 300 }],
} as const;
