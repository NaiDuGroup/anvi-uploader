import { SublimationLineErrorCode } from "@/lib/sublimation/sublimationLineCalc";

/** Every error code a sublimation API or order save can return; each has a translation. */
export const SUBLIMATION_ERROR_CODES = [
  ...Object.values(SublimationLineErrorCode),
  "subl_details_required",
  "subl_admin_only",
] as const;
export type SublimationErrorCode = (typeof SUBLIMATION_ERROR_CODES)[number];

export function isSublimationErrorCode(value: string): value is SublimationErrorCode {
  return (SUBLIMATION_ERROR_CODES as readonly string[]).includes(value);
}
