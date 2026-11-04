import type { DtfGarmentSource, DtfPlacement, GarmentKind } from "@/lib/dtf/dtfConstants";
import type { DtfErrorCode } from "@/lib/dtf/dtfErrors";

export interface DtfDictionary {
  productType: string;
  productTypeHint: string;
  /** Badge on a DTF line with no artwork file yet (site orders may come without one). */
  noFileYet: string;
  garmentKinds: Record<GarmentKind, string>;
  placements: Record<DtfPlacement, string>;
  /** Shorter names for the picker tiles (two lines at most); the full name stays in the tooltip. */
  placementTiles: Partial<Record<DtfPlacement, string>>;
  sources: Record<DtfGarmentSource, string>;
  errors: Record<DtfErrorCode, string>;

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
    /** Left / right are the wearer's. */
    sideHint: string;
    viewFront: string;
    viewBack: string;
    zoneTaken: string;
    /** Free-text place of an «other» zone: label, placeholder, hint while empty. */
    placementNote: string;
    placementNotePlaceholder: string;
    placementNoteHint: string;
    preset: string;
    customSize: string;
    widthCm: string;
    heightCm: string;
    noPress: string;
    runDiscount: (pct: number) => string;
    toItemPrice: string;
    smallerPrint: string;
    includedInGarment: string;
    maxPrint: (widthCm: number, heightCm: number) => string;
    layout: string;
    layoutOwn: string;
    layoutSameAs: (position: number) => string;
    layoutRun: (pieces: number) => string;
    sameLayoutHint: string;
    artworkHint: string;
    tier: (minQty: number) => string;
    garmentTotal: string;
    printTotal: string;
    costGarment: string;
    costFilm: string;
    costInk: string;
    costPowder: string;
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
    nesting: string;
    previewFailed: string;
    layoutNote: (gapMm: number) => string;
    unplaced: (count: number) => string;
    vectorPdfNote: (count: number) => string;
    pickTitle: string;
    pickHint: string;
    selectedCount: (selected: number, total: number) => string;
    selectAll: string;
    selectNone: string;
    pieces: (count: number) => string;
    gapLabel: string;
    gapInvalid: string;
    gapDefault: string;
    relayout: string;
    nothingSelected: string;
    relayoutFirst: string;
  };
}
