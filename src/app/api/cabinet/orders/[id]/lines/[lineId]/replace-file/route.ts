import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { getCustomerSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fileSchema } from "@/lib/validations";
import { LayoutIssueError, ownerReplaceLayoutFile, ownerReplaceLineFile } from "@/lib/orderLineLayoutIssue";

/**
 * «Заменить файл» on ONE file of a line of the customer's own order (dealer
 * or retail client). Body: `{ fileId?, files: [{ fileName, fileUrl }], kind? }`
 * — exactly one new file, a key from `POST /api/upload-url` (order scope).
 * `fileId` is the `File.id` being replaced; it may be omitted only when the
 * line has exactly one file (several → 400 `file_id_required`); a file that is
 * not on this line → 404 `file_not_in_line`. The new file keeps the old one's
 * copies / colour / paper / pages; the line's other files are not touched.
 *
 * - `kind: "layout_fix"` (default, the «Нужен макет» dialog): only NEEDS_LAYOUT
 *   lines (else 409 `line_not_flagged`);
 * - `kind: "replace"` (step 4, «Заменить файл» on a waiting position): a
 *   WAITING or NEEDS_LAYOUT line (`canOwnerReplaceLineFile`); a line already
 *   printing / done → 409 `line_started`, a made or shop order → 409 `order_locked`.
 *   Any file of the line, whatever the number of files.
 *
 * Other lines may be printing or done. Does not unlock edit / cancel of the
 * order and touches no price, quantity or stock. Another client's order → the
 * same 404 as a missing one.
 */

const bodySchema = z.object({
  fileId: z.string().trim().min(1).max(64).optional().nullable(),
  files: z.array(fileSchema.pick({ fileName: true, fileUrl: true })).min(1).max(20),
  kind: z.enum(["layout_fix", "replace"]).optional(),
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
    const actor = { userId: user.id, studioCustomerId: user.studioCustomerId };
    if (body.kind === "replace") {
      const result = await ownerReplaceLineFile(prisma, {
        orderId: id,
        lineId,
        actor,
        fileId: body.fileId ?? null,
        files: body.files,
      });
      return NextResponse.json({
        orderId: result.orderId,
        lineId: result.lineId,
        kind: result.kind,
        lineStatus: result.lineStatus,
        replacedAt: result.replacedAt,
        layoutFixedAt: result.layoutFixedAt,
        files: result.files,
        replaced: result.replaced,
      });
    }
    const result = await ownerReplaceLayoutFile(prisma, {
      orderId: id,
      lineId,
      actor,
      fileId: body.fileId ?? null,
      files: body.files,
    });
    return NextResponse.json({
      orderId: result.orderId,
      lineId: result.lineId,
      lineStatus: result.lineStatus,
      layoutFixedAt: result.layoutFixedAt,
      files: result.files,
      replaced: result.replaced,
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
