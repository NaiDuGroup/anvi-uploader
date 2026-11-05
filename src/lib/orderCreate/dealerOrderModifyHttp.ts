import { NextResponse } from "next/server";
import type { DealerOrderModifyError } from "@/lib/orderCreate/dealerOrderModify";

/** HTTP answer of a refused dealer edit / cancel. A foreign order is a plain 404. */
export function dealerModifyErrorResponse(error: DealerOrderModifyError): NextResponse {
  if (error.code === "not_found") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (error.code === "artwork_larger_than_ordered") {
    return NextResponse.json(
      { error: `Artwork ${error.detail ?? ""} is larger than the ordered size`.replace("  ", " "), code: error.code },
      { status: 422 },
    );
  }
  return NextResponse.json(
    { error: "Order can no longer be changed", code: "order_locked", reason: error.block },
    { status: 409 },
  );
}
