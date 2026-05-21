import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { z } from "zod";

const updateCommentSchema = z.object({
  text: z.string().min(1).max(1000),
});

type RouteParams = { params: Promise<{ id: string; commentId: string }> };

/**
 * PATCH — update an existing comment's text. Sets `editedAt = now()`
 * so the UI can show an "(edited)" badge. Per product decision any
 * authenticated user (admin / superadmin / workshop) may edit any
 * comment on the order — there is no per-author restriction.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: orderId, commentId } = await params;

  let parsed: z.infer<typeof updateCommentSchema>;
  try {
    parsed = updateCommentSchema.parse(await request.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed" }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const existing = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { id: true, orderId: true },
  });
  if (!existing || existing.orderId !== orderId) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }

  try {
    const updated = await prisma.comment.update({
      where: { id: commentId },
      data: { text: parsed.text, editedAt: new Date() },
      include: {
        user: { select: { id: true, name: true, displayName: true, role: true } },
      },
    });

    return NextResponse.json({
      id: updated.id,
      text: updated.text,
      createdAt: updated.createdAt,
      editedAt: updated.editedAt,
      userName: updated.user.displayName ?? updated.user.name,
      userRole: updated.user.role,
      isOwn: updated.userId === user.id,
    });
  } catch (error) {
    console.error("Failed to update comment:", error);
    return NextResponse.json({ error: "Failed to update comment" }, { status: 500 });
  }
}

/**
 * DELETE — remove a comment. Same permission model as PATCH: any
 * authenticated user. CommentRead rows reference `orderId+userId`,
 * not the comment itself, so they survive the delete and unread
 * counters self-correct on next list refresh.
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: orderId, commentId } = await params;

  const existing = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { id: true, orderId: true },
  });
  if (!existing || existing.orderId !== orderId) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }

  try {
    await prisma.comment.delete({ where: { id: commentId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete comment:", error);
    return NextResponse.json({ error: "Failed to delete comment" }, { status: 500 });
  }
}
