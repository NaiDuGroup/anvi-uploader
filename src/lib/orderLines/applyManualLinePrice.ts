import type { Prisma } from "@prisma/client";
import type { ResolvedAdminOrderLine } from "@/lib/adminOrderCreateHelpers";
import type { LargeFormatLineData } from "@/lib/largeFormat/types";
import {
  applyManualDtfLinePrice,
  applyManualLfLinePrice,
  applyManualSublimationLinePrice,
  applyManualUvLinePrice,
  isManualUnitPriceType,
  resolveManualPriceInput,
  storedManualLineTotalMdl,
  storedManualUnitPriceMdl,
} from "./manualLinePrice";

/** The stored order line an edited line replaces (same product type), for «keep the stored manual price». */
export interface ManualPricePrevLine {
  productType: string;
  largeFormatLineData?: unknown;
  dtfLineData?: unknown;
  uvLineData?: unknown;
  sublimationLineData?: unknown;
  manualUnitPriceMdl?: unknown;
}

/**
 * Applies the staff «ручная цена» of a non-sheet line to its resolved
 * snapshot (line total) or `manualUnitPriceMdl` (price per piece).
 * `input` = the request's fields (number sets, null clears, undefined keeps
 * the price of `prev`, the stored line; null `prev` for a new line).
 * Sheet lines are handled in `manualSheetLinePrice.ts`.
 */
export function applyManualLinePriceToResolved(
  r: ResolvedAdminOrderLine,
  input: { manualLineTotalMdl?: number | null; manualUnitPriceMdl?: number | null },
  prev: ManualPricePrevLine | null,
): void {
  const pt = r.input.productType;
  const samePrev = prev && prev.productType === pt ? prev : null;

  if (isManualUnitPriceType(pt)) {
    r.manualUnitPriceMdl = resolveManualPriceInput(
      input.manualUnitPriceMdl,
      storedManualUnitPriceMdl(samePrev?.manualUnitPriceMdl),
    );
    return;
  }

  if (pt === "large_format_print" && r.largeFormatExtras) {
    const manual = resolveManualPriceInput(
      input.manualLineTotalMdl,
      storedManualLineTotalMdl(samePrev?.largeFormatLineData),
    );
    r.largeFormatExtras = {
      ...r.largeFormatExtras,
      largeFormatLineData: applyManualLfLinePrice(
        r.largeFormatExtras.largeFormatLineData as unknown as LargeFormatLineData,
        manual,
      ) as unknown as Prisma.InputJsonValue,
    };
  } else if (pt === "dtf_apparel" && r.dtfExtras) {
    const manual = resolveManualPriceInput(input.manualLineTotalMdl, storedManualLineTotalMdl(samePrev?.dtfLineData));
    r.dtfExtras = { dtfLineData: applyManualDtfLinePrice(r.dtfExtras.dtfLineData, manual) };
  } else if (pt === "uv_print" && r.uvExtras) {
    const manual = resolveManualPriceInput(input.manualLineTotalMdl, storedManualLineTotalMdl(samePrev?.uvLineData));
    r.uvExtras = { uvLineData: applyManualUvLinePrice(r.uvExtras.uvLineData, manual) };
  } else if (pt === "sublimation_print" && r.sublimationExtras) {
    const manual = resolveManualPriceInput(
      input.manualLineTotalMdl,
      storedManualLineTotalMdl(samePrev?.sublimationLineData),
    );
    r.sublimationExtras = {
      sublimationLineData: applyManualSublimationLinePrice(r.sublimationExtras.sublimationLineData, manual),
    };
  }
}
