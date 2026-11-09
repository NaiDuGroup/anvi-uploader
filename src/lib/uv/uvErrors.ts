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
  "uv_stickers_need_transfer",
  "uv_as_is_needs_transfer",
  /** Dealers: a client's item needs a photo of the actual item / material. */
  "uv_item_photo_required",
  "uv_item_photo_invalid",
  /** Dealers: a client's item needs its real size (width × height). */
  "uv_item_size_required",
  /** The print size does not fit inside the item size. */
  "uv_print_larger_than_item",
] as const;
export type UvErrorCode = (typeof UV_ERROR_CODES)[number];

export function isUvErrorCode(value: string): value is UvErrorCode {
  return (UV_ERROR_CODES as readonly string[]).includes(value);
}

/**
 * The UV code a Zod validation error carries (schema refinements use the code
 * as the issue message, e.g. `uv_print_larger_than_item`), so an order API can
 * answer `{ error: code, code }` and the wizard shows the translated message
 * instead of «Validation failed». Null when no issue is a UV code.
 */
export function uvErrorCodeFromZodIssues(issues: readonly { message?: unknown }[] | undefined): UvErrorCode | null {
  for (const issue of issues ?? []) {
    if (typeof issue.message === "string" && isUvErrorCode(issue.message)) return issue.message;
  }
  return null;
}
