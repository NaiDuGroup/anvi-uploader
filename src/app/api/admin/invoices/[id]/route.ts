import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isAdmin, isSuperAdmin } from "@/lib/roles";
import { updateInvoiceSchema } from "@/lib/validations";
import { computeInvoiceTotals } from "@/lib/invoice/invoiceTotals";
import {
  INVOICE_INCLUDE,
  toSerializableInvoice,
  type InvoiceClientSnapshot,
} from "@/lib/invoice/invoiceSerialization";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: INVOICE_INCLUDE,
  });
  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ invoice: toSerializableInvoice(invoice) });
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const validated = updateInvoiceSchema.parse(body);

    const existing = await prisma.invoice.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        vatRate: true,
        issueDate: true,
        validUntil: true,
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // PAID/CANCELLED invoices are locked. To fix a paid-by-mistake invoice,
    // revert it to ISSUED first (POST .../mark-unpaid), then edit.
    if (existing.status === "PAID" || existing.status === "CANCELLED") {
      return NextResponse.json(
        { error: "Invoice is locked in current status" },
        { status: 409 },
      );
    }

    // Changing the payer: verify the client exists. On an ISSUED invoice the
    // frozen client snapshot is re-built from the new client so the PDF and
    // detail view reflect the change; on a DRAFT the snapshot stays null and
    // the live client relation drives everything.
    let newClientSnapshot: InvoiceClientSnapshot | null = null;
    if (validated.clientId !== undefined) {
      const client = await prisma.studioCustomer.findUnique({
        where: { id: validated.clientId },
        select: {
          id: true,
          kind: true,
          personName: true,
          companyName: true,
          companyIdno: true,
          phone: true,
          email: true,
        },
      });
      if (!client) {
        return NextResponse.json({ error: "Client not found" }, { status: 404 });
      }
      if (existing.status === "ISSUED") {
        newClientSnapshot = {
          kind: client.kind === "LEGAL" ? "LEGAL" : "INDIVIDUAL",
          personName: client.personName,
          companyName: client.companyName,
          companyIdno: client.companyIdno,
          phone: client.phone,
          email: client.email,
        };
      }
    }

    // DRAFT and ISSUED: full edit allowed (payer, line items, dates, notes,
    // locale). The issued number and frozen supplier snapshot are preserved.
    const updated = await prisma.$transaction(async (tx) => {
      const data: Record<string, unknown> = {};
      if (validated.clientId !== undefined) {
        data.clientId = validated.clientId;
        if (newClientSnapshot) {
          data.clientSnapshot = newClientSnapshot as unknown as object;
        }
      }
      if (validated.notes !== undefined) data.notes = validated.notes;
      if (validated.locale !== undefined) data.locale = validated.locale;
      if (validated.issueDate !== undefined) {
        data.issueDate = validated.issueDate;
      }
      if (validated.issueDate !== undefined || validated.validityDays !== undefined) {
        const baseDate = validated.issueDate ?? existing.issueDate;
        const days =
          validated.validityDays ??
          Math.max(
            1,
            Math.round(
              (existing.validUntil.getTime() - existing.issueDate.getTime()) /
                86_400_000,
            ),
          );
        const validUntil = new Date(baseDate);
        validUntil.setDate(validUntil.getDate() + days);
        data.validUntil = validUntil;
      }

      if (validated.lineItems) {
        const totals = computeInvoiceTotals(validated.lineItems, existing.vatRate);
        data.subtotal = totals.subtotal;
        data.vatAmount = totals.vatAmount;
        data.totalAmount = totals.totalAmount;

        await tx.invoiceLineItem.deleteMany({ where: { invoiceId: id } });
        await tx.invoiceLineItem.createMany({
          data: validated.lineItems.map((li, index) => {
            const computed = totals.lines[index];
            return {
              invoiceId: id,
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
        });
      }

      return tx.invoice.update({
        where: { id },
        data,
        include: INVOICE_INCLUDE,
      });
    });

    return NextResponse.json({ invoice: toSerializableInvoice(updated) });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.flatten() },
        { status: 400 },
      );
    }
    console.error("PATCH /api/admin/invoices/[id]:", error);
    const message =
      error instanceof Error ? error.message : "Failed to update invoice";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await prisma.invoice.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Only DRAFT may be deleted by admin; superadmin may always delete.
  if (existing.status !== "DRAFT" && !isSuperAdmin(user.role)) {
    return NextResponse.json(
      { error: "Only drafts can be deleted" },
      { status: 409 },
    );
  }
  await prisma.invoice.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
