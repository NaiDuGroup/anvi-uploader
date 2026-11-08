import "server-only";
import { NextResponse } from "next/server";
import type { User } from "@prisma/client";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";

/** «Библиотека макетов» endpoints: staff only (admin / superadmin / workshop), like orders. */
export async function requireLibraryStaff(): Promise<{ user: User; denied: null } | { user: null; denied: NextResponse }> {
  const user = await getSessionUser();
  if (!user) return { user: null, denied: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!isAdmin(user.role)) return { user: null, denied: NextResponse.json({ error: "Forbidden", code: "forbidden" }, { status: 403 }) };
  return { user, denied: null };
}
