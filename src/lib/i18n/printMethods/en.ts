import type { PrintMethodsDictionary } from "./types";

export const printMethodsEn: PrintMethodsDictionary = {
  loading: "Loading…",
  loadFailed: "Could not load data",
  save: "Save",
  saving: "Saving…",
  saved: "Saved",
  presetLabel: "Name",
  presetWidth: "Width, cm",
  presetHeight: "Height, cm",
  presetRetail: "Price, MDL",
  presetDealer: "Dealer, MDL",
  presetActive: "Active",
  presetInvalid: "Enter the format's name, width, height and price",
  addPreset: "Add format",
  deletePreset: "Delete",
  confirmDeletePreset: (label) => `Delete format «${label}»? Existing orders stay unchanged.`,
  fieldInvalid: (label) => `Check the «${label}» field`,
  units: {
    cm: "cm",
    ml: "ml",
    ml_per_sqm: "ml/m²",
    ml_per_m: "ml/linear m",
    g_per_m: "g/linear m",
    pct: "%",
    mdl: "MDL",
    mdl_per_sqm: "MDL/m²",
  },
  methods: {
    dtf: {
      title: "DTF: prices and norms",
      subtitle:
        "Price per print size, the print included in the garment price, and film, ink and powder usage norms. Garments live in stock categories, consumables on the DTF printer.",
      presetsTitle: "Transfer formats",
      presetsHint: "Price of one print on a client's item or an extra zone.",
      settingsTitle: "Film and usage norms",
    },
    uv: {
      title: "UV: prices and norms",
      subtitle:
        "Print is priced from its parameters: zone area × rate per m², at least the zone minimum. The main print on a stock item is included in its price. Ink and varnish are kept on the UV printer («Printers»).",
      presetsTitle: "",
      presetsHint: "",
      settingsTitle: "Print prices, surcharges and usage norms",
    },
    sublimation: {
      title: "Sublimation: usage norms",
      subtitle:
        "Epson L1800 usage per printed item: sublimation paper, heat tape and ink. Prices are per piece from the stock item's run-size tiers; there is no format price list.",
      presetsTitle: "",
      presetsHint: "",
      settingsTitle: "Waste",
    },
  },
  fields: {
    dtf: {
      filmWidthCm: { label: "Film width" },
      printableWidthCm: { label: "Printable width" },
      gapCm: { label: "Gap between artworks" },
      inkMlPerLinearMeter: { label: "Ink per linear metre" },
      powderGramsPerLinearMeter: { label: "Powder per linear metre" },
      includedPrintCreditMdl: {
        label: "Print included in item price",
        hint: "The T-shirt price already includes one print up to A4 (180 MDL).",
      },
      pressFeePerZoneMdl: { label: "Press fee per zone" },
      minimumLineTotalMdl: { label: "Minimum line total" },
    },
    uv: {
      retailPricePerSqmMdl: {
        label: "Print price per m², retail",
        hint: "For client items and extra zones: zone width × height × this rate.",
      },
      dealerPricePerSqmMdl: {
        label: "Print price per m², dealer",
        hint: "Rate for dealers; 0 — dealers pay the zone minimum.",
      },
      minimumZonePriceRetailMdl: {
        label: "Zone minimum, retail",
        hint: "A small print (text on a pen) costs at least this — positioning every item.",
      },
      minimumZonePriceDealerMdl: {
        label: "Zone minimum, dealer",
        hint: "Zone minimum for dealers.",
      },
      cmykMlPerSqm: {
        label: "CMYK colour ink",
        hint: "Usage per 1 m² of print at full coverage.",
      },
      whiteMlPerSqmPerLayer: {
        label: "Underbase (white), per layer",
        hint: "White layer under the colour on dark and clear items; multiplied by the number of layers.",
      },
      varnishMlPerSqmPerLayer: {
        label: "Varnish, per layer",
        hint: "Gloss or relief on top of colour; multiplied by the number of layers.",
      },
      primerMlPerSqm: {
        label: "Primer",
        hint: "Wiped on by hand before printing (metal, glass, plastic) per 1 m² of zone; taken from stock (INK-UV-PRIMER).",
      },
      wastePct: {
        label: "Cleaning losses",
        hint: "Head purges and cleaning — added on top of the ink used.",
      },
      whiteLayerSurchargePct: {
        label: "Underbase surcharge",
        hint: "Added to the zone print price per underbase layer above the first: one layer is included. 0 — none.",
      },
      varnishSurchargePct: {
        label: "Varnish surcharge",
        hint: "Added to the zone print price when varnish is printed. 0 — included.",
      },
      primerSurchargePct: {
        label: "Primer surcharge",
        hint: "Added to the zone print price when the zone is primed. 0 — none.",
      },
      clientItemSetupFeeMdl: {
        label: "Set-up on a client's item",
        hint: "Once per line: table set-up, test print. 0 — no fee.",
      },
      minimumLineTotalMdl: {
        label: "Minimum line total",
        hint: "A UV line's total is raised to this amount. 0 — no minimum.",
      },
    },
    sublimation: {
      wastePct: {
        label: "Waste",
        hint: "Misprints and cleaning — added to the paper, tape and ink norms.",
      },
    },
  },
  norms: {
    title: "Norms per item",
    hint: "One row per category marked «Sublimation». 0 — nothing is written off. Mugs use the «Mugs» row.",
    colCategory: "Category",
    colPaper: "Paper",
    colTape: "Heat tape",
    colInk: "Ink",
    unitSheets: "sheets",
    unitCm: "cm",
    unitMl: "ml",
    empty: "No categories are marked «Sublimation».",
    categoriesLink: "Stock categories",
    printerLink: "Epson L1800 on the «Printers» page",
  },
};
