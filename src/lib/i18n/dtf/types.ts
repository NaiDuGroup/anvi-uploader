import type { DtfConsumable, DtfGarmentSource, DtfPlacement, GarmentKind } from "@/lib/dtf/dtfConstants";
import type { DtfErrorCode } from "@/lib/dtf/dtfErrors";

export interface DtfDictionary {
  productType: string;
  productTypeHint: string;
  garmentKinds: Record<GarmentKind, string>;
  placements: Record<DtfPlacement, string>;
  sources: Record<DtfGarmentSource, string>;
  consumableNames: Record<DtfConsumable, string>;
  consumableUnits: Record<DtfConsumable, string>;
  errors: Record<DtfErrorCode, string>;

  stock: {
    title: string;
    subtitle: string;
    hubTitle: string;
    hubHint: string;
    tabGarments: string;
    tabConsumables: string;
    tabPricing: string;
    loading: string;
    loadFailed: string;
    save: string;
    saving: string;
    cancel: string;
    saved: string;
    amountsExVat: string;
    amountsWithVat: string;
  };

  garments: {
    empty: string;
    add: string;
    edit: string;
    showInactive: string;
    inactiveBadge: string;
    kind: string;
    name: string;
    namePlaceholder: string;
    color: string;
    colorPlaceholder: string;
    colorHex: string;
    sizes: string;
    sizesHint: string;
    purchaseCost: string;
    purchaseCostHint: string;
    priceTiers: string;
    priceTiersHint: string;
    tierFrom: string;
    tierPrice: string;
    addTier: string;
    applyDefaultTiers: string;
    isWhite: string;
    notes: string;
    active: string;
    totalPieces: (count: number) => string;
    avgCost: string;
    receive: string;
    priceFrom: (price: string) => string;
  };

  receipt: {
    title: (garment: string) => string;
    hint: string;
    date: string;
    supplier: string;
    note: string;
    quantity: string;
    totalCost: string;
    unitCost: string;
    unitCostPlaceholder: string;
    totalLine: (pieces: number, amount: string) => string;
    submit: string;
    empty: string;
    done: string;
  };

  consumables: {
    onHand: string;
    avgCost: (unit: string) => string;
    receive: string;
    quantity: (unit: string) => string;
    totalCost: string;
    inkTitle: string;
    inkHint: string;
    inkLink: string;
    negativeHint: string;
  };

  pricing: {
    presetsTitle: string;
    presetsHint: string;
    presetLabel: string;
    presetWidth: string;
    presetHeight: string;
    presetRetail: string;
    presetDealer: string;
    presetActive: string;
    addPreset: string;
    deletePreset: string;
    confirmDeletePreset: (label: string) => string;
    settingsTitle: string;
    filmWidthCm: string;
    printableWidthCm: string;
    gapCm: string;
    inkMlPerLinearMeter: string;
    powderGramsPerLinearMeter: string;
    includedPrintCreditMdl: string;
    includedPrintCreditHint: string;
    pressFeePerZoneMdl: string;
    minimumLineTotalMdl: string;
  };

  editor: {
    source: string;
    garment: string;
    pickGarment: string;
    noGarments: string;
    sizes: string;
    size: string;
    quantity: string;
    addSize: string;
    inStock: (count: number) => string;
    shortage: (count: number) => string;
    zones: string;
    addZone: string;
    removeZone: string;
    placement: string;
    preset: string;
    customSize: string;
    widthCm: string;
    heightCm: string;
    includedInGarment: string;
    sameLayoutHint: string;
    artworkHint: string;
    tier: (minQty: number) => string;
    garmentTotal: string;
    printTotal: string;
    pressTotal: string;
    minimumUplift: string;
    total: string;
    cost: string;
    profit: string;
    film: (meters: string) => string;
    quoting: string;
    pieces: (count: number) => string;
  };

  workshop: {
    section: string;
    summary: (pieces: number, zones: number) => string;
    clientGarment: string;
    filmLayout: string;
    filmLayoutTitle: string;
    filmLength: (meters: string) => string;
    transfers: (count: number) => string;
    noTransfers: string;
    download: string;
    filmWidth: (cm: number) => string;
    missingArtwork: (count: number) => string;
    downloadFailed: string;
    building: string;
    close: string;
  };
}
