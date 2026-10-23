import { DtfLineErrorCode } from "@/lib/dtf/dtfLineCalc";

/** Every error code a DTF API or order save can return; each has a translation. */
export const DTF_ERROR_CODES = [
  ...Object.values(DtfLineErrorCode),
  "dtf_details_required",
  "dtf_admin_only",
  "dtf_garment_required",
  "dtf_quantity_max",
  "dtf_size_duplicate",
  "dtf_zone_duplicate",
  "dtf_zone_size_required",
  "dtf_size_in_use",
] as const;
export type DtfErrorCode = (typeof DTF_ERROR_CODES)[number];

export function isDtfErrorCode(value: string): value is DtfErrorCode {
  return (DTF_ERROR_CODES as readonly string[]).includes(value);
}
