import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma, type User } from "@prisma/client";
import { getSessionUser } from "@/lib/auth";
import { canManageMugCatalog } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { InsufficientStockError } from "./ledger";
import { isStockUnit, StockUnit } from "./kinds";
import { quantityProblem } from "./quantity";

/** Shared plumbing for `/api/admin/stock/**` routes. */

/** Thrown inside handlers to answer with a specific status + error code. */
export class StockApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly extra: Record<string, unknown> = {},
  ) {
    super(code);
    this.name = "StockApiError";
  }
}

export async function requireStockManager(): Promise<User> {
  const user = await getSessionUser();
  if (!user || !canManageMugCatalog(user.role)) {
    throw new StockApiError(user ? 403 : 401, user ? "forbidden" : "unauthorized");
  }
  return user;
}

/** Runs a handler and maps known failures to JSON errors. */
export async function stockRoute(tag: string, handler: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await handler();
  } catch (e) {
    if (e instanceof StockApiError) {
      return NextResponse.json({ error: e.code, ...e.extra }, { status: e.status });
    }
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "validation_failed", details: e.issues }, { status: 400 });
    }
    if (e instanceof SyntaxError) {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }
    if (e instanceof InsufficientStockError) {
      return NextResponse.json(
        { error: "insufficient_stock", requested: e.requested, available: e.available },
        { status: 409 },
      );
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") {
        return NextResponse.json({ error: "sku_taken" }, { status: 409 });
      }
      if (e.code === "P2025") {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
      if (e.code === "P2021" || e.code === "P2022") {
        return NextResponse.json(
          { error: "database_schema_outdated", hint: "Run: npm run db:prepare" },
          { status: 503 },
        );
      }
    }
    console.error(`[${tag}]`, e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export function categoryUnit(value: string): StockUnit {
  return isStockUnit(value) ? value : StockUnit.Pieces;
}

/** 400 `invalid_quantity` when the number does not fit the category unit (e.g. 1.5 pcs). */
export function assertQuantityForUnit(
  value: number,
  unit: StockUnit,
  field: string,
  opts: { allowZero?: boolean } = {},
): void {
  const problem = quantityProblem(value, unit, opts);
  if (problem) throw new StockApiError(400, "invalid_quantity", { field, problem, unit });
}

/** Variant + its category unit, or 404. */
export async function loadVariantWithUnit(
  variantId: string,
): Promise<{ id: string; unit: StockUnit; stockQuantity: number }> {
  const v = await prisma.stockVariant.findUnique({
    where: { id: variantId },
    select: { id: true, stockQuantity: true, item: { select: { category: { select: { unit: true } } } } },
  });
  if (!v) throw new StockApiError(404, "not_found");
  return {
    id: v.id,
    unit: categoryUnit(v.item.category.unit),
    stockQuantity: Number(v.stockQuantity.toString()),
  };
}

/**
 * SKUs already used by other items/variants (case-insensitive), so the client
 * can say which one clashes instead of a bare unique-constraint error.
 */
export async function findTakenSkus(params: {
  itemSkus?: string[];
  variantSkus?: string[];
  excludeItemId?: string;
  excludeVariantIds?: string[];
}): Promise<string[]> {
  const taken: string[] = [];
  if (params.itemSkus && params.itemSkus.length > 0) {
    const rows = await prisma.stockItem.findMany({
      where: {
        OR: params.itemSkus.map((sku) => ({ sku: { equals: sku, mode: "insensitive" as const } })),
        ...(params.excludeItemId ? { id: { not: params.excludeItemId } } : {}),
      },
      select: { sku: true },
    });
    taken.push(...rows.map((r) => r.sku));
  }
  if (params.variantSkus && params.variantSkus.length > 0) {
    const rows = await prisma.stockVariant.findMany({
      where: {
        OR: params.variantSkus.map((sku) => ({ sku: { equals: sku, mode: "insensitive" as const } })),
        ...(params.excludeVariantIds && params.excludeVariantIds.length > 0
          ? { id: { notIn: params.excludeVariantIds } }
          : {}),
      },
      select: { sku: true },
    });
    taken.push(...rows.map((r) => r.sku));
  }
  return taken;
}

export async function assertSkusFree(params: Parameters<typeof findTakenSkus>[0]): Promise<void> {
  const taken: string[] = await findTakenSkus(params);
  if (taken.length > 0) throw new StockApiError(409, "sku_taken", { skus: taken });
}

export function decimalOrNull(value: number | null | undefined, places: number): Prisma.Decimal | null {
  if (value == null || !Number.isFinite(value)) return null;
  return new Prisma.Decimal(value.toFixed(places));
}

/** Only keys present in the patch: `undefined` = leave alone, `null` = clear. */
export function decimalPatch(
  value: number | null | undefined,
  places: number,
): Prisma.Decimal | null | undefined {
  return value === undefined ? undefined : decimalOrNull(value, places);
}
