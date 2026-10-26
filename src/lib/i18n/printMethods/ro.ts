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
  },
  methods: {
    dtf: {
      subtitle:
        "Prețuri pe mărimea imprimării, imprimarea inclusă în prețul articolului și norme de consum pentru film, cerneală și pudră. Articolele sunt în categoriile depozitului, consumabilele — la imprimanta DTF.",
      presetsTitle: "Formate transfer",
      presetsHint: "Prețul unei imprimări pe articolul clientului sau al unei zone suplimentare.",
      settingsTitle: "Film și norme de consum",
    },
    uv: {
      subtitle:
        "Prețuri pe mărimea imprimării, suprataxe pentru alb și lac, norme de consum al cernelii. Cerneala și lacul — la imprimanta UV («Imprimante»).",
      presetsTitle: "Formate de imprimare",
      presetsHint: "Prețul unei imprimări după mărime — pe articolul clientului sau din depozit.",
      settingsTitle: "Norme de consum și suprataxe",
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
      cmykMlPerSqm: {
        label: "Cerneală color CMYK",
        hint: "Consum pe 1 m² de imprimare la acoperire completă.",
      },
      whiteMlPerSqmPerLayer: {
        label: "Alb, pe strat",
        hint: "Strat de bază pe articole închise și transparente; se înmulțește cu numărul de straturi.",
      },
      varnishMlPerSqmPerLayer: {
        label: "Lac, pe strat",
        hint: "Luciu sau relief peste culoare; se înmulțește cu numărul de straturi.",
      },
      wastePct: {
        label: "Pierderi la curățare",
        hint: "Curățarea și spălarea capetelor — se adaugă la consumul de cerneală.",
      },
      whiteLayerSurchargePct: {
        label: "Suprataxă pentru alb",
        hint: "La prețul formatului zonei, dacă se imprimă alb. 0 — inclus în preț.",
      },
      varnishSurchargePct: {
        label: "Suprataxă pentru lac",
        hint: "La prețul formatului zonei, dacă se imprimă lac. 0 — inclus în preț.",
      },
      includedPrintCreditMdl: {
        label: "Imprimare inclusă în prețul articolului",
        hint: "Partea din prețul primei zone inclusă deja în prețul articolului din stoc — ca la tricourile DTF. Doar pentru articole din stoc; 0 — imprimarea se taxează integral.",
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
  },
};
