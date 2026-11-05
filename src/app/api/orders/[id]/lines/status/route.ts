import type { NextRequest } from "next/server";
import { handleLineStatusPatch, singleOrderLineStatusSchema } from "@/lib/orderLineStatusApi";

/**
 * Set the production status of some lines of one order; the order status is
 * re-derived from its lines in the same transaction. Body `{ lineIds, status }`,
 * status one of WAITING / PRINTING / DONE.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleLineStatusPatch(
    () => request.json(),
    (body) => {
      const v = singleOrderLineStatusSchema.parse(body);
      return { requests: [{ orderId: id, lineIds: v.lineIds }], status: v.status };
    },
  );
}
