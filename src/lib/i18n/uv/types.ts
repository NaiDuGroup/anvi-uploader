import type { UvItemSource, UvPlacement } from "@/lib/uv/uvConstants";
import type { UvErrorCode } from "@/lib/uv/uvErrors";

/** «UV-печать» order line: editor, order views and workshop board. */
export interface UvDictionary {
  productType: string;
  productTypeHint: string;
  placements: Record<UvPlacement, string>;
  sources: Record<UvItemSource, string>;
  errors: Record<UvErrorCode, string>;
  editor: {
    source: string;
    item: string;
    noItems: string;
    quantity: string;
    description: string;
    descriptionPlaceholder: string;
    notes: string;
    notesPlaceholder: string;
    inStock: (count: number) => string;
    shortage: (count: number) => string;
    zones: string;
    addZone: string;
    removeZone: string;
    placement: string;
    placementLabel: string;
    preset: string;
    customSize: string;
    widthCm: string;
    heightCm: string;
    whiteLayers: string;
    whiteLayerOption: (layers: number) => string;
    varnish: string;
    includedInItem: string;
    noPresets: string;
    noPresetsLink: string;
    tier: (minQty: number) => string;
    itemTotal: string;
    printTotal: string;
    whiteTotal: string;
    varnishTotal: string;
    setupFee: string;
    minimumUplift: string;
    total: string;
    cost: string;
    profit: string;
    ink: (cmykMl: string, whiteMl: string, varnishMl: string) => string;
    pieces: (count: number) => string;
  };
  workshop: {
    section: string;
    clientItem: string;
    white: (layers: number) => string;
    varnish: string;
  };
}
