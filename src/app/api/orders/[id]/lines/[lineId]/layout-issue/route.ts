import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/roles";
import { LAYOUT_ISSUE_NOTE_MAX, LAYOUT_ISSUE_REASONS } from "@/lib/layoutIssue";
import { clearLineLayoutIssue, flagLineLayoutIssue, LayoutIssueError } from "@/lib/orderLineLayoutIssue";

/**
 * «⚠ Нужен макет» on one order line (staff: admin / workshop / superadmin).
 *
 * - `POST { reason, note? }`: flag (order in the workshop phase, line waiting or printing);
 * - `DELETE`: «Снять отметку», the line returns to WAITING.
 *
 * The order status is re-derived in the same transaction; the line code
 * goes into every log entry.
 */

const flagSchema = z.object({
  reason: z.enum(LAYOUT_ISSUE_REASONS),
  note: z.string().max(LAYOUT_ISSUE_NOTE_MAX).nullish(),
});

type Ctx = { params: Promise<{ id: string; lineId: string }> };

function errorResponse(error: unknown): NextResponse {
  if (error instanceof LayoutIssueError) {
    return NextResponse.json({ error: error.code }, { status: error.httpStatus });
  }
  if (error instanceof ZodError || error instanceof SyntaxError) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }
  console.error("Layout issue update failed:", error);
  return NextResponse.json({ error: "Failed to update line" }, { status: 500 });
}

async function staff() {
  const user = await getSessionUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!isAdmin(user.role)) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { user };
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const auth = await staff();
  if (!auth.user) return auth.error;
  const { id, lineId } = await params;
  try {
    const body = flagSchema.parse(await request.json());
    const result = await flagLineLayoutIssue(prisma, {
      orderId: id,
      lineId,
      reason: body.reason,
      note: body.note,
      userId: auth.user.id,
    });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const auth = await staff();
  if (!auth.user) return auth.error;
  const { id, lineId } = await params;
  try {
    const result = await clearLineLayoutIssue(prisma, { orderId: id, lineId, userId: auth.user.id });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
