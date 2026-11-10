import { NextResponse } from "next/server";
import type { User } from "@prisma/client";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { IDNO_PATTERN, parseIdnoValue } from "./http";

/** Bookkeeping API guard: super admin only. */
export async function requireSuperAdmin(): Promise<{ user: User } | { response: NextResponse }> {
  const user = await getSessionUser();
  if (!user) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!isSuperAdmin(user.role)) return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { user };
}

export const IDNO_RE = IDNO_PATTERN;

/** Trimmed IDNO matching IDNO_RE, else null (→ 400 invalid_idno). */
export const parseIdno = parseIdnoValue;

/** `{ ids: string[] }` → up to 500 distinct non-empty ids. */
export function parseIds(body: unknown): string[] | null {
  const ids = (body as { ids?: unknown })?.ids;
  if (!Array.isArray(ids)) return null;
  const out = [...new Set(ids.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 64))];
  return out.length > 0 && out.length <= 500 ? out : null;
}
