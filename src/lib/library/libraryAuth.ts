import "server-only";
import { NextResponse } from "next/server";
import type { User } from "@prisma/client";
import { getSessionUser } from "@/lib/auth";
import { canManageLibrary, isAdmin } from "@/lib/roles";

/** «Библиотека макетов» endpoints: staff only (admin / superadmin / workshop), like orders. */
export async function requireLibraryStaff(): Promise<{ user: User; denied: null } | { user: null; denied: NextResponse }> {
  const user = await getSessionUser();
  if (!user) return { user: null, denied: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!isAdmin(user.role)) return { user: null, denied: NextResponse.json({ error: "Forbidden", code: "forbidden" }, { status: 403 }) };
  return { user, denied: null };
}

/** Edit / archive / restore / delete: staff allowed by canManageLibrary (currently all staff). */
export async function requireLibraryManager(): Promise<{ user: User; denied: null } | { user: null; denied: NextResponse }> {
  const res = await requireLibraryStaff();
  if (res.denied) return res;
  if (!canManageLibrary(res.user.role)) {
    return { user: null, denied: NextResponse.json({ error: "Forbidden", code: "forbidden" }, { status: 403 }) };
  }
  return res;
}
