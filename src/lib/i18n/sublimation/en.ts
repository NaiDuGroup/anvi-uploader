import type { SublimationDictionary } from "./types";

export const sublimationEn: SublimationDictionary = {
  productType: "Sublimation",
  productTypeHint: "Pillows, puzzles, keychains, clocks, mouse pads and mugs — from stock",
  errors: {
    subl_item_not_found: "Item not found, inactive or not marked «Sublimation»",
    subl_item_no_price: "The item has no 1-piece price",
    subl_details_required: "Pick the item and quantity for sublimation",
    subl_admin_only: "Sublimation orders are entered in the admin only",
  },
  editor: {
    item: "Stock item",
    noItems: "No items for sublimation — mark stock categories «Sublimation»",
    quantity: "Pcs",
    inStock: (count) => `${count} in stock`,
    shortage: (count) => `${count} short`,
    tier: (minQty) => (minQty > 1 ? `price from ${minQty} pcs` : "price per 1 pc"),
    dealerPrice: "dealer price",
    unitPrice: "Per pc",
    total: "Total",
    cost: "Cost",
    profit: "Profit",
    usage: (paper, tape, ink) => `paper ${paper} sheets · tape ${tape} m · ink ${ink} ml`,
    noNorms: "No usage norms for this category yet — the Epson writes nothing off.",
    normsLink: "Usage norms",
    pieces: (count) => `${count} pcs`,
  },
  workshop: {
    section: "Sublimation",
    noFiles: "no print file",
  },
};
