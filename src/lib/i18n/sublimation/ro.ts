import type { SublimationDictionary } from "./types";

export const sublimationRo: SublimationDictionary = {
  productType: "Sublimare",
  productTypeHint: "Perne, puzzle, brelocuri, ceasuri, mousepad-uri și căni — din depozit",
  errors: {
    subl_item_not_found: "Articolul nu a fost găsit, este dezactivat sau nu este marcat «Sublimare»",
    subl_item_no_price: "Articolul nu are preț pentru 1 buc.",
    subl_details_required: "Alegeți articolul și cantitatea pentru sublimare",
    subl_admin_only: "Sublimarea se comandă doar din admin",
  },
  editor: {
    item: "Articol din depozit",
    noItems: "Nu există articole pentru sublimare — marcați categoriile depozitului «Sublimare»",
    quantity: "Buc.",
    inStock: (count) => `în stoc ${count}`,
    shortage: (count) => `lipsesc ${count}`,
    tier: (minQty) => (minQty > 1 ? `preț de la ${minQty} buc.` : "preț pentru 1 buc."),
    dealerPrice: "preț dealer",
    unitPrice: "Pe buc.",
    total: "Total",
    cost: "Cost",
    profit: "Profit",
    usage: (paper, tape, ink) => `hârtie ${paper} coli · bandă ${tape} m · cerneală ${ink} ml`,
    noNorms: "Normele de consum pentru această categorie nu sunt setate — Epson nu scade nimic.",
    normsLink: "Norme de consum",
    pieces: (count) => `${count} buc.`,
  },
  workshop: {
    section: "Sublimare",
    noFiles: "fără fișier de imprimare",
  },
};
