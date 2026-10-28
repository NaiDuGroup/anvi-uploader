import type { PrintMethodsDictionary } from "./types";

export const printMethodsRo: PrintMethodsDictionary = {
  loading: "Se încarcă…",
  loadFailed: "Datele nu au putut fi încărcate",
  save: "Salvează",
  saving: "Se salvează…",
  saved: "Salvat",
  presetLabel: "Denumire",
  presetWidth: "Lățime, cm",
  presetHeight: "Înălțime, cm",
  presetRetail: "Preț, lei",
  presetDealer: "Dealer, lei",
  presetActive: "Activ",
  presetInvalid: "Indicați denumirea, lățimea, înălțimea și prețul formatului",
  addPreset: "Adaugă format",
  deletePreset: "Șterge",
  confirmDeletePreset: (label) => `Ștergeți formatul «${label}»? Comenzile vechi nu se schimbă.`,
  fieldInvalid: (label) => `Verificați câmpul «${label}»`,
  units: {
    cm: "cm",
    ml: "ml",
    ml_per_sqm: "ml/m²",
    ml_per_m: "ml/m liniar",
    g_per_m: "g/m liniar",
    pct: "%",
    mdl: "lei",
    mdl_per_sqm: "lei/m²",
  },
  methods: {
    dtf: {
      title: "DTF: prețuri și norme",
      subtitle:
        "Prețuri pe mărimea imprimării, imprimarea inclusă în prețul articolului și norme de consum pentru film, cerneală și pudră. Articolele sunt în categoriile depozitului, consumabilele — la imprimanta DTF.",
      presetsTitle: "Formate transfer",
      presetsHint: "Prețul unei imprimări pe articolul clientului sau al unei zone suplimentare.",
      settingsTitle: "Film și norme de consum",
    },
    uv: {
      title: "UV: prețuri și norme",
      subtitle:
        "Prețul imprimării — după parametri: suprafața zonei × tariful pe m², nu mai puțin decât minimul pe zonă. Imprimarea principală pe articolul din depozit e inclusă în prețul lui. Cerneala și lacul — la imprimanta UV («Imprimante»).",
      presetsTitle: "",
      presetsHint: "",
      settingsTitle: "Prețuri de imprimare, suprataxe și norme de consum",
    },
    sublimation: {
      title: "Sublimare: norme de consum",
      subtitle:
        "Consumul Epson L1800 pe un articol: hârtie de sublimare, bandă termică și cerneală. Prețul — pe bucată, după treptele de tiraj ale articolului din depozit; fără listă de formate.",
      presetsTitle: "",
      presetsHint: "",
      settingsTitle: "Pierderi",
    },
  },
  fields: {
    dtf: {
      filmWidthCm: { label: "Lățimea filmului" },
      printableWidthCm: { label: "Lățimea imprimabilă" },
      gapCm: { label: "Distanța dintre machete" },
      inkMlPerLinearMeter: { label: "Cerneală pe metru liniar" },
      powderGramsPerLinearMeter: { label: "Pudră pe metru liniar" },
      includedPrintCreditMdl: {
        label: "Imprimare inclusă în prețul articolului",
        hint: "Prețul tricoului include deja o imprimare până la A4 (180 lei).",
      },
      pressFeePerZoneMdl: { label: "Taxă de presare per zonă" },
      minimumLineTotalMdl: { label: "Suma minimă a liniei" },
    },
    uv: {
      retailPricePerSqmMdl: {
        label: "Preț imprimare pe m², retail",
        hint: "Pentru articolul clientului și zonele suplimentare: lățimea × înălțimea zonei × acest tarif.",
      },
      dealerPricePerSqmMdl: {
        label: "Preț imprimare pe m², dealer",
        hint: "Tariful pentru dealeri; 0 — dealerii plătesc minimul pe zonă.",
      },
      minimumZonePriceRetailMdl: {
        label: "Minim pe zonă, retail",
        hint: "O imprimare mică (text pe pix) costă cel puțin atât — poziționarea fiecărui articol.",
      },
      minimumZonePriceDealerMdl: {
        label: "Minim pe zonă, dealer",
        hint: "Minimul pe zonă pentru dealeri.",
      },
      cmykMlPerSqm: {
        label: "Cerneală color CMYK",
        hint: "Consum pe 1 m² de imprimare la acoperire completă.",
      },
      whiteMlPerSqmPerLayer: {
        label: "Strat de bază (alb), pe strat",
        hint: "Strat alb sub culoare pe articole închise și transparente; se înmulțește cu numărul de straturi.",
      },
      varnishMlPerSqmPerLayer: {
        label: "Lac, pe strat",
        hint: "Luciu sau relief peste culoare; se înmulțește cu numărul de straturi.",
      },
      primerMlPerSqm: {
        label: "Primer",
        hint: "Se aplică manual înainte de imprimare (metal, sticlă, plastic) pe 1 m² de zonă; se scade din stoc (INK-UV-PRIMER).",
      },
      wastePct: {
        label: "Pierderi la curățare",
        hint: "Curățarea și spălarea capetelor — se adaugă la consumul de cerneală.",
      },
      whiteLayerSurchargePct: {
        label: "Suprataxă pentru stratul de bază",
        hint: "La prețul imprimării zonei, pentru fiecare strat peste primul: un strat e inclus. 0 — fără suprataxă.",
      },
      varnishSurchargePct: {
        label: "Suprataxă pentru lac",
        hint: "La prețul imprimării zonei, dacă se imprimă lac. 0 — inclus în preț.",
      },
      primerSurchargePct: {
        label: "Suprataxă pentru primer",
        hint: "La prețul imprimării zonei, dacă zona se grunduiește cu primer. 0 — fără suprataxă.",
      },
      clientItemSetupFeeMdl: {
        label: "Reglaj pe articolul clientului",
        hint: "O dată pe linie: reglarea mesei, imprimare de probă. 0 — fără suprataxă.",
      },
      minimumLineTotalMdl: {
        label: "Suma minimă a liniei",
        hint: "Suma liniei UV se ridică până la această valoare. 0 — fără minim.",
      },
    },
    sublimation: {
      wastePct: {
        label: "Pierderi",
        hint: "Rebut și curățări — se adaugă la normele de hârtie, bandă și cerneală.",
      },
    },
  },
  norms: {
    title: "Norme pe un articol",
    hint: "Pentru fiecare categorie marcată «Sublimare». 0 — nu se scade nimic. Canele scad după rândul «Căni».",
    colCategory: "Categorie",
    colPaper: "Hârtie",
    colTape: "Bandă termică",
    colInk: "Cerneală",
    unitSheets: "coli",
    unitCm: "cm",
    unitMl: "ml",
    empty: "Nu există categorii marcate «Sublimare».",
    categoriesLink: "Categoriile depozitului",
    printerLink: "Epson L1800 pe pagina «Imprimante»",
    clientItemTitle: "Articolul clientului: prețuri",
    clientItemHint:
      "Clientul aduce articolul său — din depozit nu se ia nimic. Preț pe buc. = aria imprimării × tarif pe m², nu sub minim; plus reglaj o dată pe linie; linia se ridică până la minim. 0 la tarif și minim — prețul nu este setat.",
    clientItemFields: {
      retailPricePerSqmMdl: { label: "Tarif pe m², retail" },
      dealerPricePerSqmMdl: { label: "Tarif pe m², dealer" },
      minimumPriceRetailMdl: { label: "Minim pe buc., retail" },
      minimumPriceDealerMdl: { label: "Minim pe buc., dealer" },
      setupFeeMdl: { label: "Reglaj pe linie", hint: "O dată pe linie cu articolul clientului. 0 — fără supliment." },
      minimumLineTotalMdl: { label: "Suma minimă a liniei", hint: "0 — fără minim." },
      inkMlPerSqm: { label: "Cerneală pe m² de imprimare" },
      tapeCmPerPiece: { label: "Bandă termică pe buc." },
    },
  },
};
