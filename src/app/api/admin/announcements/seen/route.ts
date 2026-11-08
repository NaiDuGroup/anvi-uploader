import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isKnownSeenKey, isStaffRole } from "@/lib/announcements";

export const runtime = "nodejs";

const Body = z.object({ id: z.string().min(1).max(100) });

/**
 * «Что нового»: remember that the signed-in staff user has seen an announcement
 * (`{ id: "library-2026-11" }`) or used a hinted feature (`{ id: "library-2026-11:save-hint" }`).
 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isStaffRole(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isKnownSeenKey(parsed.data.id)) {
    return NextResponse.json({ error: "Unknown announcement" }, { status: 400 });
  }
  const { id } = parsed.data;
  if (!user.seenAnnouncements.includes(id)) {
    await prisma.user.update({ where: { id: user.id }, data: { seenAnnouncements: { push: id } } });
  }
  return NextResponse.json({ ok: true });
}
