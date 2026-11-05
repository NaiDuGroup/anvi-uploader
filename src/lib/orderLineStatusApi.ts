import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/roles";
import {
  LineStatusError,
  setOrderLineStatuses,
  type LineStatusChangeRequest,
} from "@/lib/orderLineStatusUpdate";
import { SETTABLE_LINE_STATUSES } from "@/lib/orderStatusFromLines";

/**
 * Shared handler of the line status endpoints:
 * - `PATCH /api/orders/[id]/lines/status` `{ lineIds, status }` (one order);
 * - `PATCH /api/workshop-board/line-status` `{ items: [{ orderId, lineIds }], status }` (board, several orders).
 *
 * Staff only (admin / workshop / superadmin). All or nothing: a foreign line,
 * a trashed order or an order outside the workshop phase rejects the whole call.
 */

const lineIds = z.array(z.string().min(1).max(64)).min(1).max(500);
const status = z.enum(SETTABLE_LINE_STATUSES);

export const singleOrderLineStatusSchema = z.object({ lineIds, status });
export const boardLineStatusSchema = z.object({
  items: z.array(z.object({ orderId: z.string().min(1).max(64), lineIds })).min(1).max(200),
  status,
});

export async function handleLineStatusPatch(
  readBody: () => Promise<unknown>,
  toRequests: (body: unknown) => { requests: LineStatusChangeRequest[]; status: (typeof SETTABLE_LINE_STATUSES)[number] },
): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let parsed: ReturnType<typeof toRequests>;
  try {
    parsed = toRequests(await readBody());
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "Validation failed" }, { status: 400 });
    }
    throw error;
  }

  try {
    const results = await setOrderLineStatuses(prisma, {
      requests: parsed.requests,
      status: parsed.status,
      userId: user.id,
    });
    return NextResponse.json({ orders: results });
  } catch (error) {
    if (error instanceof LineStatusError) {
      return NextResponse.json({ error: error.code, orderId: error.orderId }, { status: error.httpStatus });
    }
    console.error("Failed to set line status:", error);
    return NextResponse.json({ error: "Failed to set line status" }, { status: 500 });
  }
}
