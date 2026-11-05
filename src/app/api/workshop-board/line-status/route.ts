import type { NextRequest } from "next/server";
import { boardLineStatusSchema, handleLineStatusPatch } from "@/lib/orderLineStatusApi";

/**
 * Workshop board: set the production status of lines across several orders in
 * one transaction. Body `{ items: [{ orderId, lineIds }], status }`.
 */
export async function PATCH(request: NextRequest) {
  return handleLineStatusPatch(
    () => request.json(),
    (body) => {
      const v = boardLineStatusSchema.parse(body);
      return { requests: v.items, status: v.status };
    },
  );
}
