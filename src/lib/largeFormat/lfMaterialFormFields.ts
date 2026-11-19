import { z } from "zod";
import { LF_ROLL_WIDTH_MAX_METERS, type LfMaterialForm } from "./lfSheet";

/** Admin create / edit fields of a wide-format material's form (roll | sheet). */
export const lfMaterialFormFieldsSchema = {
  materialForm: z.enum(["roll", "sheet"]).optional(),
  sheetWidthCm: z.union([z.number().positive().max(1000), z.null()]).optional(),
  sheetHeightCm: z.union([z.number().positive().max(1000), z.null()]).optional(),
  sheetMarginMm: z.number().int().min(0).max(100).optional(),
  retailPricePerSheet: z.union([z.number().int().min(0).max(99_999_999), z.null()]).optional(),
  dealerPricePerSheet: z.union([z.number().int().min(0).max(99_999_999), z.null()]).optional(),
};

export const LF_ROLL_WIDTH_IN_CM_HINT = "Ширина в метрах, например 1.07";
export const LF_SHEET_SIZE_REQUIRED_HINT = "Укажите размер листа в см, например 61 × 86";
export const LF_FORM_SWITCH_BLOCKED_HINT =
  "Рулон ↔ лист можно переключить, только пока остаток 0 и по материалу нет движений склада";

/**
 * Issue with the material's resulting state, or null: a roll wider than 10 m is
 * centimetres typed into the metres field (e.g. VATMAN 61 / 55); a sheet
 * material needs its sheet size.
 */
export function lfMaterialFormIssue(state: {
  materialForm: LfMaterialForm;
  rollWidthMeters: number | null;
  sheetWidthCm: number | null;
  sheetHeightCm: number | null;
}): { code: "lf_roll_width_in_cm" | "lf_sheet_size_required"; error: string } | null {
  if (state.materialForm === "sheet") {
    if (!(state.sheetWidthCm != null && state.sheetWidthCm > 0 && state.sheetHeightCm != null && state.sheetHeightCm > 0)) {
      return { code: "lf_sheet_size_required", error: LF_SHEET_SIZE_REQUIRED_HINT };
    }
    return null;
  }
  if (state.rollWidthMeters == null || !(state.rollWidthMeters > 0)) {
    return { code: "lf_roll_width_in_cm", error: LF_ROLL_WIDTH_IN_CM_HINT };
  }
  if (state.rollWidthMeters > LF_ROLL_WIDTH_MAX_METERS) {
    return { code: "lf_roll_width_in_cm", error: LF_ROLL_WIDTH_IN_CM_HINT };
  }
  return null;
}

/** Roll width column of a sheet material (NOT NULL): the sheet's width in metres. */
export function lfSheetRollWidthPlaceholderMeters(sheetWidthCm: number): string {
  return (Math.round(sheetWidthCm * 10) / 1000).toFixed(3);
}
