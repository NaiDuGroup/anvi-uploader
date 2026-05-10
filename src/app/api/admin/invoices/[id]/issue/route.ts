import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { formatInvoiceNumber } from "@/lib/invoice/companyProfile";
import {
  INVOICE_INCLUDE,
  toSerializableInvoice,
  type InvoiceClientSnapshot,
  type InvoiceSupplierSnapshot,
} from "@/lib/invoice/invoiceSerialization";

interface Ctx {
  params: Promise<{ id: string }>;
}

/**
 * Atomically transitions a DRAFT invoice to ISSUED:
 *   - increments CompanyProfile.invoiceCounter and assigns sequenceNumber
 *   - formats `number` (zero-padded) and stores it
 *   - freezes supplier + client snapshots into JSON columns
 *   - sets validUntil = issueDate + validityDays
 *
 * Concurrency: Prisma's `update increment` translates to a SQL atomic
 * UPDATE with arithmetic, so two simultaneous issue calls receive distinct
 * counters; the unique index on `sequence_number` is the safety net.
 */
export async function POST(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id },
        include: {
          companyProfile: true,
          client: true,
          lineItems: true,
        },
      });
      if (!invoice) return { error: "Not found", status: 404 } as const;
      if (invoice.status !== "DRAFT") {
        return { error: "Only drafts can be issued", status: 409 } as const;
      }
      if (invoice.lineItems.length === 0) {
        return {
          error: "Cannot issue an invoice with no line items",
          status: 400,
        } as const;
      }

      const profile = await tx.companyProfile.update({
        where: { id: invoice.companyProfileId },
        data: { invoiceCounter: { increment: 1 } },
      });
      const sequenceNumber = profile.invoiceCounter;
      const number = formatInvoiceNumber(
        sequenceNumber,
        profile.invoiceNumberPadding,
      );

      const supplierSnapshot: InvoiceSupplierSnapshot = {
        name: profile.name,
        fiscalCode: profile.fiscalCode,
        address: profile.address,
        iban: profile.iban,
        bankName: profile.bankName,
        bic: profile.bic,
        directorName: profile.directorName ?? null,
        accountantName: profile.accountantName ?? null,
        logoPath: profile.logoPath ?? null,
      };
      const clientSnapshot: InvoiceClientSnapshot = {
        kind: invoice.client.kind === "LEGAL" ? "LEGAL" : "INDIVIDUAL",
        personName: invoice.client.personName,
        companyName: invoice.client.companyName,
        companyIdno: invoice.client.companyIdno,
        companyIban: invoice.client.companyIban,
        phone: invoice.client.phone,
        email: invoice.client.email,
      };

      // validUntil may already be set on the draft; re-derive in case the
      // admin edited issueDate/validity at the last moment without saving.
      const validityDays = Math.max(
        1,
        Math.round(
          (invoice.validUntil.getTime() - invoice.issueDate.getTime()) /
            86_400_000,
        ),
      );
      const validUntil = new Date(invoice.issueDate);
      validUntil.setDate(validUntil.getDate() + validityDays);

      const updated = await tx.invoice.update({
        where: { id },
        data: {
          status: "ISSUED",
          number,
          sequenceNumber,
          validUntil,
          supplierSnapshot: supplierSnapshot as unknown as object,
          clientSnapshot: clientSnapshot as unknown as object,
        },
        include: INVOICE_INCLUDE,
      });
      return { invoice: updated } as const;
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ invoice: toSerializableInvoice(result.invoice) });
  } catch (error) {
    console.error("POST /api/admin/invoices/[id]/issue:", error);
    const message =
      error instanceof Error ? error.message : "Failed to issue invoice";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
