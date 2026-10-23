import { NextResponse } from "next/server";
import { Prisma, type User } from "@prisma/client";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { DtfLineError } from "@/lib/dtf/dtfLineCalc";
import { canManageMugCatalog, isAdmin } from "@/lib/roles";

export enum DtfAccess {
  /** Studio staff building orders. */
  Read,
  /** Workshop + super admin: stock, price list, norms. */
  Manage,
}

/** Session user allowed for `access`, or the 403 response to return. */
export async function requireDtfUser(access: DtfAccess): Promise<User | NextResponse> {
  const user = await getSessionUser();
  const allowed: boolean =
    user != null &&
    (access === DtfAccess.Read ? isAdmin(user.role) : canManageMugCatalog(user.role));
  if (!user || !allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return user;
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new z.ZodError([
      { code: "custom", message: "invalid_json", path: [] },
    ]);
  }
}

/** Shared error mapping for `/api/admin/dtf/**`. */
export function dtfRouteError(error: unknown, label: string): NextResponse {
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { error: "validation_failed", details: error.flatten() },
      { status: 400 },
    );
  }
  if (error instanceof DtfLineError) {
    return NextResponse.json({ error: error.code }, { status: 400 });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2021" || error.code === "P2022") {
      return NextResponse.json(
        { error: "database_schema_outdated", hint: "Run: npm run db:prepare" },
        { status: 503 },
      );
    }
    if (error.code === "P2002") {
      return NextResponse.json({ error: "duplicate" }, { status: 409 });
    }
    if (error.code === "P2025") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
  }
  console.error(`dtf ${label}:`, error);
  return NextResponse.json({ error: "failed" }, { status: 500 });
}
