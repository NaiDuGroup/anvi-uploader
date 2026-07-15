import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { isEFacturaLive } from "@/lib/efactura";
import {
  FISCAL_STATUS_BUCKET_CODES,
  type FiscalStatusBucket,
} from "@/lib/efactura/types";

export const runtime = "nodejs";

function parseStatusBucket(raw: string | null): FiscalStatusBucket | null {
  if (
    raw === "signed" ||
    raw === "awaiting_signature" ||
    raw === "rejected" ||
    raw === "cancelled" ||
    raw === "draft"
  ) {
    return raw;
  }
  return null;
}

type PaymentFilter = "terminal" | "transfer" | "unpaid";

function parsePaymentFilter(raw: string | null): PaymentFilter | null {
  if (raw === "terminal" || raw === "transfer" || raw === "unpaid") {
    return raw;
  }
  return null;
}

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim();
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = Math.min(
      100,
      Math.max(5, Number(searchParams.get("pageSize")) || 25),
    );

    const statusBucket = parseStatusBucket(searchParams.get("statusBucket"));
    // Legacy single-code filter still supported.
    const statusRaw = searchParams.get("status");
    const status =
      statusRaw !== null && statusRaw !== "" && Number.isFinite(Number(statusRaw))
        ? Number(statusRaw)
        : null;

    const dateFromRaw = searchParams.get("dateFrom");
    const dateToRaw = searchParams.get("dateTo");
    const dateFrom = dateFromRaw ? new Date(`${dateFromRaw}T00:00:00.000Z`) : null;
    const dateTo = dateToRaw ? new Date(`${dateToRaw}T23:59:59.999Z`) : null;
    const issueDateFilter =
      (dateFrom && !Number.isNaN(dateFrom.getTime())) ||
      (dateTo && !Number.isNaN(dateTo.getTime()))
        ? {
            issueDate: {
              ...(dateFrom && !Number.isNaN(dateFrom.getTime())
                ? { gte: dateFrom }
                : {}),
              ...(dateTo && !Number.isNaN(dateTo.getTime())
                ? { lte: dateTo }
                : {}),
            },
          }
        : {};

    const statusFilter = statusBucket
      ? { eFacturaStatus: { in: FISCAL_STATUS_BUCKET_CODES[statusBucket] } }
      : status !== null
        ? { eFacturaStatus: status }
        : {};

    const payment = parsePaymentFilter(searchParams.get("payment"));
    const paymentFilter =
      payment === "terminal"
        ? { receiptSettledAt: { not: null } }
        : payment === "transfer"
          ? { paidAt: { not: null }, receiptSettledAt: null }
          : payment === "unpaid"
            ? { paidAt: null, receiptSettledAt: null }
            : {};

    const where = {
      ...statusFilter,
      ...issueDateFilter,
      ...paymentFilter,
      ...(q
        ? {
            OR: [
              { number: { contains: q, mode: "insensitive" as const } },
              { seria: { contains: q, mode: "insensitive" as const } },
              { buyerName: { contains: q, mode: "insensitive" as const } },
              { buyerIdno: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.fiscalInvoice.count({ where }),
      prisma.fiscalInvoice.findMany({
        where,
        include: {
          client: { select: { id: true, companyName: true, personName: true } },
        },
        orderBy: [
          { issueDate: { sort: "desc", nulls: "last" } },
          { createdAt: "desc" },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return NextResponse.json({
      live: isEFacturaLive(),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      fiscalInvoices: rows.map((f) => ({
        id: f.id,
        seria: f.seria,
        number: f.number,
        fullNumber: `${f.seria}${f.number}`,
        status: f.eFacturaStatus,
        issueDate: f.issueDate ? f.issueDate.toISOString() : null,
        totalAmount: f.totalAmount ? f.totalAmount.toString() : null,
        currency: f.currency,
        buyerName: f.buyerName,
        buyerIdno: f.buyerIdno,
        clientName:
          f.client?.companyName?.trim() || f.client?.personName?.trim() || null,
        paidAt: f.paidAt ? f.paidAt.toISOString() : null,
        receiptRef: f.receiptRef,
        receiptMethod: f.receiptMethod,
        receiptSettledAt: f.receiptSettledAt ? f.receiptSettledAt.toISOString() : null,
        redirections: f.redirections,
        lastSyncedAt: f.lastSyncedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("GET /api/admin/fiscal-invoices:", error);
    return NextResponse.json(
      { error: "Failed to load fiscal invoices" },
      { status: 500 },
    );
  }
}
