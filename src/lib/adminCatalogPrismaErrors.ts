import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

export const ADMIN_CATALOG_SCHEMA_DRIFT_HINT =
  "Need PostgreSQL running and DATABASE_URL in .env set correctly. From project root run `npm run db:prepare` (same as migrate deploy + generate), then restart `npm run dev`. The `dev` script already runs `db:prepare` first; if it still fails run `npm run db:doctor` or `npx prisma migrate status` and fix drift with migrations in prisma/migrations.";

export function prismaKnownErrorDebugPayload(e: unknown): {
  prismaCode?: string;
  prismaMessage?: string;
  prismaMeta?: unknown;
} {
  if (typeof e !== "object" || e === null) return {};
  const o = e as { code?: unknown; message?: unknown; meta?: unknown };
  return {
    prismaCode: typeof o.code === "string" ? o.code : undefined,
    prismaMessage: typeof o.message === "string" ? o.message : undefined,
    prismaMeta: o.meta,
  };
}

export function adminCatalogErrorMessageLooksLikeSchemaDrift(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const m = e.message.toLowerCase();
  return (
    (m.includes("column") && m.includes("does not exist")) ||
    (m.includes("purchase_cost") && m.includes("does not exist"))
  );
}

const PRISMA_STALE_CLIENT_HINT =
  "Run `npx prisma generate`, stop the dev server completely, then `npm run dev` again. Run `npm run db:prepare` if migrations might be missing.";

const PRISMA_VALIDATION_HINT =
  "Request or server payload did not match Prisma types. In development, see `prismaMessage` for details or check catalog form values (e.g. print dimensions).";

/**
 * `PrismaClientValidationError` is often misread as a stale client; many cases
 * are invalid `Decimal` values, wrong types, etc. Only treat as stale when the
 * message indicates the client's DMMF does not know a field/arg.
 */
export function validationErrorLooksLikeStaleClient(message: string): boolean {
  const m = message.toLowerCase();
  if (
    m.includes("unknown arg") ||
    m.includes("unknown field") ||
    m.includes("unknown argument")
  ) {
    return true;
  }
  if (
    m.includes("purchasecost") &&
    (m.includes("unknown") || m.includes("did you mean"))
  ) {
    return true;
  }
  return false;
}

/**
 * Map Prisma failures on mug/notebook catalog PATCH to actionable JSON.
 * Returns `null` when not handled (caller should log and return 500).
 */
export function adminCatalogPatchPrismaResponse(e: unknown): NextResponse | null {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") {
      return NextResponse.json({ error: "sku_taken" }, { status: 409 });
    }
    if (e.code === "P2022" || e.code === "P2021") {
      const debug =
        process.env.NODE_ENV === "development" ? prismaKnownErrorDebugPayload(e) : {};
      return NextResponse.json(
        {
          error: "database_schema_outdated",
          hint: ADMIN_CATALOG_SCHEMA_DRIFT_HINT,
          ...debug,
        },
        { status: 503 },
      );
    }
  }
  if (e instanceof Prisma.PrismaClientValidationError) {
    const stale = validationErrorLooksLikeStaleClient(e.message);
    const debug =
      process.env.NODE_ENV === "development" ? { prismaMessage: e.message } : {};
    if (stale) {
      return NextResponse.json(
        {
          error: "prisma_client_stale",
          hint: PRISMA_STALE_CLIENT_HINT,
          ...debug,
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      {
        error: "prisma_validation_failed",
        hint: PRISMA_VALIDATION_HINT,
        ...debug,
      },
      { status: 400 },
    );
  }
  if (adminCatalogErrorMessageLooksLikeSchemaDrift(e)) {
    const debug =
      process.env.NODE_ENV === "development" && e instanceof Error
        ? { prismaMessage: e.message }
        : {};
    return NextResponse.json(
      {
        error: "database_schema_outdated",
        hint: ADMIN_CATALOG_SCHEMA_DRIFT_HINT,
        ...debug,
      },
      { status: 503 },
    );
  }
  if (e instanceof Error && e.message.includes("Prisma client is outdated")) {
    return NextResponse.json(
      {
        error: "prisma_client_stale",
        hint: "Run `npx prisma generate`, then restart the dev server.",
      },
      { status: 503 },
    );
  }
  return null;
}
