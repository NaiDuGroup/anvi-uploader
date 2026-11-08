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
  presetDealerNoPress: "Dealer fără presare, lei",
  presetActive: "Activ",
  presetInvalid: "Indicați denumirea, lățimea, înălțimea și prețul formatului",
  addPreset: "Adaugă format",
  deletePreset: "Șterge",
  confirmDeletePreset: (label) => `Formatul «${label}» va fi șters. Comenzile vechi nu se schimbă.`,
  confirmDeletePresetTitle: "Ștergeți formatul?",
  fieldInvalid: (label) => `Verificați câmpul «${label}»`,
  units: {
    cm: "cm",
    mm: "mm",
    ml: "ml",
    ml_per_sqm: "ml/m²",
    ml_per_m: "ml/m liniar",
    g_per_m: "g/m liniar",
    pct: "%",
    mdl: "lei",
    mdl_per_sqm: "lei/m²",
    mdl_per_m: "MDL/m",
    pcs: "buc",
  },
  methods: {
    dtf: {
      title: "DTF: prețuri și norme",
      subtitle:
        "Articolul din depozit + imprimarea după listă (tricou 100 + A4 180 = 280). Șepcile și ciorapii se vând în set: logo (șapcă până la 5×9, ciorapi până la 10×10) e inclus în preț, altă mărime — plus diferența din listă (se schimbă în fișa articolului). Retail cu reducere de tiraj, dealerii — la prețul lor. Normele dau costul.",
      presetsTitle: "Formate transfer",
      presetsHint: "Prețul unei imprimări cu presare. «Dealer fără presare» — transferul copt, predat fără presare (doar dealeri, doar pe articolul clientului).",
      settingsTitle: "Reduceri, minime și norme de consum",
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
      layoutGapMm: { label: "Distanța pe film în atelier", hint: "Macheta din atelier: distanța dintre contururile reale ale desenelor. Marginile transparente ale fișierului nu contează." },
      whiteChokeMm: { label: "Retragerea stratului alb", hint: "Canalul spot «White» este puțin mai mic decât desenul, ca să nu iasă pe margine." },
      inkMlPerLinearMeter: { label: "Cerneală pe metru liniar" },
      powderGramsPerLinearMeter: { label: "Pudră pe metru liniar" },
      runDiscount1MinQty: {
        label: "Reducere tiraj 1: de la",
        hint: "Retail, aceeași machetă pentru toate bucățile. 0 buc — treapta oprită.",
      },
      runDiscount1Pct: { label: "Reducere 1" },
      runDiscount2MinQty: { label: "Reducere tiraj 2: de la" },
      runDiscount2Pct: { label: "Reducere 2" },
      runDiscount3MinQty: { label: "Reducere tiraj 3: de la" },
      runDiscount3Pct: { label: "Reducere 3" },
      runDiscountRoundToMdl: {
        label: "Rotunjire preț redus la",
        hint: "De ex. 5 lei: 167,40 → 165. Dealerii nu au reducere — au prețul lor pe format.",
      },
      minimumPrintOnlyRetailMdl: {
        label: "Minim «doar imprimare», retail",
        hint: "Imprimare pe articolul clientului sau fără articol: linia costă cel puțin atât.",
      },
      minimumPrintOnlyDealerMdl: { label: "Minim «doar imprimare», dealer" },
      pressFeePerZoneMdl: { label: "Taxă de presare per zonă" },
      minimumLineTotalMdl: { label: "Suma minimă a liniei" },
    },
    uv: {
      retailPricePerSqmMdl: {
        label: "Preț imprimare pe m², retail",
        hint: "Pentru articolul clientului și zonele suplimentare: lățimea × înălțimea zonei × acest tarif.",
      },
      uvDtfRetailPerMeterMdl: {
        label: "UV-DTF: preț pe metru liniar, retail",
        hint: "Film de 30 cm; autocolantele se așază automat. A3 ≈ 0,42 m.",
      },
      uvDtfDealerPerMeterMdl: {
        label: "UV-DTF: preț pe metru liniar, dealer",
        hint: "Pentru dealeri.",
      },
      uvDtfMinimumRetailMdl: {
        label: "UV-DTF: minim pe rând, retail",
        hint: "Autocolante și articolul clientului. Articolele noastre (căni) — la prețul articolului.",
      },
      uvDtfMinimumDealerMdl: {
        label: "UV-DTF: minim pe rând, dealer",
        hint: "Pentru dealeri.",
      },
      uvDtfPrintableWidthCm: {
        label: "UV-DTF: lățimea utilă a filmului",
        hint: "Rola de 32 cm printează 30 cm.",
      },
      uvDtfGapCm: {
        label: "UV-DTF: spațiu între autocolante",
        hint: "Pentru tăiere.",
      },
      uvDtfRoundToMdl: {
        label: "UV-DTF: rotunjirea prețului",
        hint: "Prețul pe metri se rotunjește la această valoare. 0 — fără rotunjire.",
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
