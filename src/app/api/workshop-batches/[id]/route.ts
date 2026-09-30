/**
 * Soft-delete a workshop batch history entry. The underlying R2 object is
 * left in place — the standard `uploads/` lifecycle rule will delete it at
 * `createdAt + 7 days`. This keeps the endpoint free of side effects on the
 * object storage happy path (no permission or timing coupling).
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "workshop" && user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const row = await prisma.workshopBatchLayout.findUnique({
    where: { id },
    select: { id: true, deletedAt: true },
  });
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (row.deletedAt) {
    return NextResponse.json({ ok: true, alreadyDeleted: true });
  }

  await prisma.workshopBatchLayout.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
