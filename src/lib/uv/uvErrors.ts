import { UvLineErrorCode } from "@/lib/uv/uvLineCalc";

/** Every error code a UV API or order save can return; each has a translation. */
export const UV_ERROR_CODES = [
  ...Object.values(UvLineErrorCode),
  "uv_details_required",
  "uv_admin_only",
  "uv_item_required",
  "uv_client_item_required",
  "uv_zone_duplicate",
  "uv_zone_size_required",
  "uv_placement_label_required",
] as const;
export type UvErrorCode = (typeof UV_ERROR_CODES)[number];

export function isUvErrorCode(value: string): value is UvErrorCode {
  return (UV_ERROR_CODES as readonly string[]).includes(value);
}
