import type { DtfGarmentSource, DtfPlacement, GarmentKind } from "@/lib/dtf/dtfConstants";
import type { DtfErrorCode } from "@/lib/dtf/dtfErrors";

export interface DtfDictionary {
  productType: string;
  productTypeHint: string;
  garmentKinds: Record<GarmentKind, string>;
  placements: Record<DtfPlacement, string>;
  sources: Record<DtfGarmentSource, string>;
  errors: Record<DtfErrorCode, string>;

  stock: {
    subtitle: string;
    tabGarments: string;
    tabConsumables: string;
    tabPricing: string;
    loading: string;
    loadFailed: string;
    save: string;
    saving: string;
    saved: string;
    garmentsNote: string;
    garmentsNoteHint: string;
    garmentsManageCategories: string;
    garmentsNoCategories: string;
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
