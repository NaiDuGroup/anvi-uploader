import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import {
  INVOICE_INCLUDE,
  toSerializableInvoice,
  type InvoiceClientSnapshot,
  type InvoiceSupplierSnapshot,
} from "@/lib/invoice/invoiceSerialization";
import { getOrCreateCompanyProfile } from "@/lib/invoice/companyProfile";
import { LOCALES, type Locale } from "@/lib/i18n";

// `@react-pdf/renderer` loads native font parsers; force Node runtime.
export const runtime = "nodejs";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, ctx: Ctx) {
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

  const serialized = toSerializableInvoice(invoice);
  const profile = await getOrCreateCompanyProfile();

  const supplier: InvoiceSupplierSnapshot =
    serialized.supplierSnapshot ?? {
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
  const payer: InvoiceClientSnapshot =
    serialized.clientSnapshot ?? {
      kind: serialized.client.kind === "LEGAL" ? "LEGAL" : "INDIVIDUAL",
      personName: serialized.client.personName,
      companyName: serialized.client.companyName,
      companyIdno: serialized.client.companyIdno,
      companyIban: serialized.client.companyIban,
      phone: serialized.client.phone,
      email: null,
    };

  const url = new URL(request.url);
  const localeParam = url.searchParams.get("locale");
  const locale: Locale = (LOCALES as readonly string[]).includes(localeParam ?? "")
    ? (localeParam as Locale)
    : (serialized.locale as Locale);

  // Lazy-load the PDF renderer so the heavy module doesn't bloat the route map.
  const { renderInvoicePdfBuffer } = await import("@/lib/invoice/invoicePdf");
  const buffer = await renderInvoicePdfBuffer({
    invoice: serialized,
    supplier,
    payer,
    locale,
  });

  const filename = serialized.number
    ? `Cont_${serialized.number}.pdf`
    : `Invoice_${serialized.id.slice(0, 8)}.pdf`;
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
