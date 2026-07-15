import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";

export const runtime = "nodejs";

/** Mark a counterparty as operational / not a real client. */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { idno?: string; name?: string; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const idno = body.idno?.trim();
  if (!idno) {
    return NextResponse.json({ error: "idno is required" }, { status: 400 });
  }

  const row = await prisma.reconciliationExclusion.upsert({
    where: { idno },
    create: {
      idno,
      name: body.name?.trim() || null,
      note: body.note?.trim() || null,
      createdById: user.id,
    },
    update: {
      name: body.name?.trim() || null,
      note: body.note?.trim() || null,
    },
  });

  return NextResponse.json({ ok: true, exclusion: row });
}

/** Remove an admin-added operational exclusion (built-in defaults have no DB row). */
export async function DELETE(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let idno = request.nextUrl.searchParams.get("idno")?.trim();
  if (!idno) {
    try {
      const body = await request.json();
      idno = typeof body?.idno === "string" ? body.idno.trim() : undefined;
    } catch {
      // no body
    }
  }

  if (!idno) {
    return NextResponse.json({ error: "idno is required" }, { status: 400 });
  }

  await prisma.reconciliationExclusion.deleteMany({ where: { idno } });
  return NextResponse.json({ ok: true });
}
