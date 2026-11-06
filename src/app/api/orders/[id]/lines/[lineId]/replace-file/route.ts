import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/roles";
import { fileSchema } from "@/lib/validations";
import { LayoutIssueError, staffReplaceLayoutFile } from "@/lib/orderLineLayoutIssue";

/**
 * Staff «Заменить файл» on a «Нужен макет» line (admin / workshop /
 * superadmin), from the studio orders list, the ЦЕХ sidebar or the workshop
 * board. Body: `{ files: [{ fileName, fileUrl }] }` — `fileUrl` is a key from
 * `POST /api/upload-url` or an http(s) link («или вставьте ссылку»; not for
 * sheet products / DTF). Only NEEDS_LAYOUT lines (else 409 `line_not_flagged`);
 * the order row is locked, old files are archived, the line returns to
 * WAITING with `layoutFixedAt`, the order status is re-derived. No price,
 * quantity or stock changes.
 */

const bodySchema = z.object({
  files: z.array(fileSchema.pick({ fileName: true, fileUrl: true })).min(1).max(20),
});

type Ctx = { params: Promise<{ id: string; lineId: string }> };

export async function POST(request: NextRequest, { params }: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, lineId } = await params;

  try {
    const body = bodySchema.parse(await request.json());
    const result = await staffReplaceLayoutFile(prisma, {
      orderId: id,
      lineId,
      userId: user.id,
      files: body.files,
    });
    return NextResponse.json({
      orderId: result.orderId,
      lineId: result.lineId,
      lineCode: result.lineCode,
      lineStatus: result.lineStatus,
      newOrderStatus: result.newOrderStatus,
      layoutFixedAt: result.layoutFixedAt,
      files: result.files,
      archivedFiles: result.archivedFiles,
    });
  } catch (error) {
    if (error instanceof LayoutIssueError) {
      return NextResponse.json({ error: error.code, detail: error.detail }, { status: error.httpStatus });
    }
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "Validation failed" }, { status: 400 });
    }
    console.error("Failed to replace layout file (staff):", error);
    return NextResponse.json({ error: "Failed to replace file" }, { status: 500 });
  }
}
