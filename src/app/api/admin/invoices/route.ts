import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import {
  INVOICE_STATUSES,
  createInvoiceSchema,
  type InvoiceStatus,
} from "@/lib/validations";
import { getOrCreateCompanyProfile } from "@/lib/invoice/companyProfile";
import { computeInvoiceTotals } from "@/lib/invoice/invoiceTotals";
import {
  INVOICE_INCLUDE,
  toSerializableInvoice,
} from "@/lib/invoice/invoiceSerialization";

function requireStaff(user: Awaited<ReturnType<typeof getSessionUser>>) {
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(user.role)) {
    return NextResponse.json(
      { error: "Forbidden: studio admin only" },
      { status: 403 },
    );
  }
  return null;
}

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  const denied = requireStaff(user);
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status")?.trim();
    const clientId = searchParams.get("clientId")?.trim();
    const from = searchParams.get("from")?.trim();
    const to = searchParams.get("to")?.trim();
    const search = searchParams.get("q")?.trim() ?? "";
    const take = Math.min(
      200,
      Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10) || 50),
    );

    const where: Prisma.InvoiceWhereInput = {};
    if (status && (INVOICE_STATUSES as readonly string[]).includes(status)) {
      where.status = status as InvoiceStatus;
    }
    if (clientId) where.clientId = clientId;
    const issueDateRange: Prisma.DateTimeFilter = {};
    if (from) issueDateRange.gte = new Date(from);
    if (to) issueDateRange.lte = new Date(to);
    if (Object.keys(issueDateRange).length > 0) {
      where.issueDate = issueDateRange;
    }
    if (search.length > 0) {
      where.OR = [
        { number: { contains: search, mode: "insensitive" } },
        {
          client: {
            OR: [
              { companyName: { contains: search, mode: "insensitive" } },
              { personName: { contains: search, mode: "insensitive" } },
              { phone: { contains: search, mode: "insensitive" } },
            ],
          },
        },
      ];
    }

    const invoices = await prisma.invoice.findMany({
      where,
      include: INVOICE_INCLUDE,
      orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
      take,
    });
    return NextResponse.json({
      invoices: invoices.map(toSerializableInvoice),
    });
  } catch (error) {
    console.error("GET /api/admin/invoices:", error);
    const message =
      error instanceof Error ? error.message : "Failed to load invoices";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  const denied = requireStaff(user);
  if (denied) return denied;

  try {
    const body = await request.json();
    const validated = createInvoiceSchema.parse(body);

    const client = await prisma.studioCustomer.findUnique({
      where: { id: validated.clientId },
      select: { id: true },
    });
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const profile = await getOrCreateCompanyProfile();
    const issueDate = validated.issueDate ?? new Date();
    const validityDays =
      validated.validityDays ?? profile.invoiceValidityDays ?? 5;
    const validUntil = new Date(issueDate);
    validUntil.setDate(validUntil.getDate() + validityDays);

    const totals = computeInvoiceTotals(validated.lineItems, profile.vatRate);

    const created = await prisma.invoice.create({
      data: {
        companyProfileId: profile.id,
        clientId: validated.clientId,
        status: "DRAFT",
        locale: validated.locale ?? profile.defaultLocale,
        currency: profile.currency,
        issueDate,
        validUntil,
        vatRate: profile.vatRate,
        vatInclusive: true,
        subtotal: totals.subtotal,
        vatAmount: totals.vatAmount,
        totalAmount: totals.totalAmount,
        notes: validated.notes ?? null,
        createdById: user!.id,
        lineItems: {
          create: validated.lineItems.map((li, index) => {
            const computed = totals.lines[index];
            return {
              position: index,
              description: li.description.trim(),
              unit: li.unit?.trim() || "buc",
              quantity: computed.quantity,
              unitPrice: computed.unitPrice,
              lineTotal: computed.lineTotal,
              vatAmount: computed.vatAmount,
              orderId: li.orderId ?? null,
            };
          }),
        },
      },
      include: INVOICE_INCLUDE,
    });

    return NextResponse.json(
      { invoice: toSerializableInvoice(created) },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.flatten() },
        { status: 400 },
      );
    }
    console.error("POST /api/admin/invoices:", error);
    const message =
      error instanceof Error ? error.message : "Failed to create invoice";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
