import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { getCustomerSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fileSchema } from "@/lib/validations";
import { LayoutIssueError, ownerReplaceLayoutFile } from "@/lib/orderLineLayoutIssue";

/**
 * «Заменить файл» on a «Нужен макет» line of the customer's own order (dealer
 * or retail client). Body: `{ files: [{ fileName, fileUrl }] }` — keys from
 * `POST /api/upload-url` (order scope). Only NEEDS_LAYOUT lines; other lines
 * may be printing or done. Does not unlock edit / cancel of the order and
 * touches no price, quantity or stock. Another client's order → the same
 * 404 as a missing one.
 */

const bodySchema = z.object({
  files: z.array(fileSchema.pick({ fileName: true, fileUrl: true })).min(1).max(20),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; lineId: string }> },
) {
  const user = await getCustomerSessionUser();
  if (!user || !user.studioCustomerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id, lineId } = await params;

  try {
    const body = bodySchema.parse(await request.json());
    const result = await ownerReplaceLayoutFile(prisma, {
      orderId: id,
      lineId,
      actor: { userId: user.id, studioCustomerId: user.studioCustomerId },
      files: body.files,
    });
    return NextResponse.json({
      orderId: result.orderId,
      lineId: result.lineId,
      lineStatus: result.lineStatus,
      layoutFixedAt: result.layoutFixedAt,
      files: result.files,
    });
  } catch (error) {
    if (error instanceof LayoutIssueError) {
      if (error.code === "order_not_found" || error.code === "line_not_in_order") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({ error: error.code, detail: error.detail }, { status: error.httpStatus });
    }
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "Validation failed" }, { status: 400 });
    }
    console.error("Failed to replace layout file:", error);
    return NextResponse.json({ error: "Failed to replace file" }, { status: 500 });
  }
}
