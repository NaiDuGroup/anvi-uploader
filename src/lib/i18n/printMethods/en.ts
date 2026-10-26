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
        "Price per print size, white and varnish surcharges, and ink usage norms. Ink and varnish are kept on the UV printer («Printers»).",
      presetsTitle: "Print formats",
      presetsHint: "Price of one print by size — on a client's item or a stock item.",
      settingsTitle: "Usage norms and surcharges",
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
      cmykMlPerSqm: {
        label: "CMYK colour ink",
        hint: "Usage per 1 m² of print at full coverage.",
      },
      whiteMlPerSqmPerLayer: {
        label: "White, per layer",
        hint: "Base layer on dark and clear items; multiplied by the number of layers.",
      },
      varnishMlPerSqmPerLayer: {
        label: "Varnish, per layer",
        hint: "Gloss or relief on top of colour; multiplied by the number of layers.",
      },
      wastePct: {
        label: "Cleaning losses",
        hint: "Head purges and cleaning — added on top of the ink used.",
      },
      whiteLayerSurchargePct: {
        label: "White surcharge",
        hint: "Added to the zone's format price when white is printed. 0 — included.",
      },
      varnishSurchargePct: {
        label: "Varnish surcharge",
        hint: "Added to the zone's format price when varnish is printed. 0 — included.",
      },
      includedPrintCreditMdl: {
        label: "Print included in the item price",
        hint: "Part of the first zone price already included in a stock item's price — like t-shirts in DTF. Stock items only; 0 — print is charged in full.",
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
