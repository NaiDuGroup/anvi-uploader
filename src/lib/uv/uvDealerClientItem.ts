import type { UvErrorCode } from "@/lib/uv/uvErrors";
import type { UvLineInput } from "@/lib/uv/uvLineInput";

/**
 * Dealer cabinet: a UV print on the client's own item needs a photo of the
 * actual item / material and its real size, so the workshop does not have to
 * guess what it prints on (owner 2026-11-09). Optional for staff orders.
 * Null when the line is fine (or not a client item).
 */
export function uvDealerClientItemIssue(input: Pick<UvLineInput, "source" | "clientItem">): UvErrorCode | null {
  if (input.source !== "client") return null;
  const item = input.clientItem;
  if (!item?.photo) return "uv_item_photo_required";
  if (!(item.itemWidthCm != null && item.itemWidthCm > 0 && item.itemHeightCm != null && item.itemHeightCm > 0)) {
    return "uv_item_size_required";
  }
  return null;
}

/**
 * First issue among dealer order lines (UV on a client's item without photo / size).
 * «Набор» lines are skipped: their zones are the set's items, not the client's.
 */
export function uvDealerLinesIssue(
  lines: readonly { productType: string; uv?: Pick<UvLineInput, "source" | "clientItem"> | null; set?: unknown }[],
): UvErrorCode | null {
  for (const line of lines) {
    if (line.productType !== "uv_print" || !line.uv || line.set) continue;
    const issue = uvDealerClientItemIssue(line.uv);
    if (issue) return issue;
  }
  return null;
}
