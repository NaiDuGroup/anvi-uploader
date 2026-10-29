import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma, type User } from "@prisma/client";
import { getSessionUser } from "@/lib/auth";
import { canManageImports } from "@/lib/roles";
import { InsufficientStockError } from "@/lib/stock/unified/ledger";
import { ImportPostError } from "./postImport";

/** Thrown inside handlers to answer with a status + error code. */
export class ImportApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, public readonly extra: Record<string, unknown> = {}) {
    super(code);
    this.name = "ImportApiError";
  }
}

/** Imports carry purchase money: workshop admin and super admin only. */
export async function requireImportManager(): Promise<User> {
  const user = await getSessionUser();
  if (!user || !canManageImports(user.role)) {
    throw new ImportApiError(user ? 403 : 401, user ? "forbidden" : "unauthorized");
  }
  return user;
}

export async function importRoute(tag: string, handler: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await handler();
  } catch (e) {
    if (e instanceof ImportApiError) return NextResponse.json({ error: e.code, ...e.extra }, { status: e.status });
    if (e instanceof ImportPostError) return NextResponse.json({ error: e.code, ...e.extra }, { status: 409 });
    if (e instanceof InsufficientStockError) {
      return NextResponse.json({ error: "insufficient_stock", requested: e.requested, available: e.available }, { status: 409 });
    }
    if (e instanceof z.ZodError) return NextResponse.json({ error: "validation_failed", details: e.issues }, { status: 400 });
    if (e instanceof SyntaxError) return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") return NextResponse.json({ error: "sku_taken" }, { status: 409 });
      if (e.code === "P2025") return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    console.error(`${tag}:`, e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optText = (max: number) => z.string().trim().max(max).nullable().optional();

export const importHeaderSchema = z.object({
  supplierName: z.string().trim().min(1).max(200),
  supplierOrderNo: optText(80),
  proformaNo: optText(80),
  brokerName: optText(200),
  declarationNo: optText(80),
  trackingNo: optText(120),
  currency: z.string().trim().regex(/^[A-Z]{3}$/).optional(),
  orderedAt: dateStr.nullable().optional(),
  arrivedAt: dateStr.nullable().optional(),
  status: z.enum(["ordered", "in_transit", "customs", "received", "posted"]).optional(),
  notes: z.string().max(5000).nullable().optional(),
  relatedImportId: z.string().uuid().nullable().optional(),
});
export const importPatchSchema = importHeaderSchema.partial();

export const importCostSchema = z.object({
  kind: z.enum(["supplier_payment", "bank_fee", "customs", "broker", "freight", "other"]),
  amountMdl: z.number().min(0).max(100_000_000),
  isProvisional: z.boolean().optional(),
  excluded: z.boolean().optional(),
  note: optText(500),
});

export const importDocumentSchema = z.object({
  kind: z.enum(["proforma", "invoice", "declaration", "broker_invoice", "payment", "awb", "correspondence", "other"]),
  fileKey: z.string().min(1).max(500),
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().max(120).nullable().optional(),
  sizeBytes: z.number().int().min(0).nullable().optional(),
  note: optText(500),
});

/** `"2026-10-15"` → Date (UTC midnight) / null. */
export function toDateOnly(v: string | null | undefined): Date | null | undefined {
  if (v === undefined) return undefined;
  return v ? new Date(`${v}T00:00:00.000Z`) : null;
}
