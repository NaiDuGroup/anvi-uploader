import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { computeClientStatement } from "@/lib/reconciliation/report";
import { renderActPdfBuffer } from "@/lib/reconciliation/actPdf";
import { getOrCreateCompanyProfile } from "@/lib/invoice/companyProfile";
import { INVOICE_LOCALES, type InvoiceLocale } from "@/lib/validations";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ idno: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { idno } = await params;
  try {
    const statement = await computeClientStatement(idno);
    if (!statement) {
      return NextResponse.json({ error: "No fiscal invoices for buyer" }, { status: 404 });
    }

    const profile = await getOrCreateCompanyProfile();
    const localeParam = request.nextUrl.searchParams.get("locale");
    const locale: InvoiceLocale =
      localeParam && (INVOICE_LOCALES as readonly string[]).includes(localeParam)
        ? (localeParam as InvoiceLocale)
        : (profile.defaultLocale as InvoiceLocale) ?? "ro";

    const buffer = await renderActPdfBuffer(statement, profile.currency, locale);
    const safeName = statement.buyer.name.replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 40);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="act-verificare-${safeName}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("GET /api/admin/reconciliation/act/[idno]/pdf:", error);
    return NextResponse.json(
      { error: "Failed to render reconciliation act" },
      { status: 500 },
    );
  }
}
