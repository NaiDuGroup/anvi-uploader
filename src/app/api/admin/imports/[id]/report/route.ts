import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadImportDetail } from "@/lib/imports/importQueries";
import { ImportApiError, importRoute, requireImportManager } from "@/lib/imports/importRoute";
import { getDictionary, LOCALES, type Locale } from "@/lib/i18n";

// `@react-pdf/renderer` and `sharp` need Node.
export const runtime = "nodejs";
// Up to a few hundred supplier photos are fetched for one report.
export const maxDuration = 60;

/** GET: costing report PDF — photos, purchase / landed cost per piece, current prices. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return importRoute("GET /api/admin/imports/[id]/report", async () => {
    await requireImportManager();
    const { id } = await params;
    const data = await loadImportDetail(prisma, id);
    if (!data) throw new ImportApiError(404, "not_found");

    const variantIds: string[] = [...new Set(data.lines.flatMap((l) => (l.variant ? [l.variant.id] : [])))];
    const rows = await prisma.stockVariant.findMany({
      where: { id: { in: variantIds } },
      select: { id: true, sellPrice: true, dealerPrice: true },
    });
    const n = (d: { toString(): string } | null): number | null => (d == null ? null : Number(d.toString()));
    const prices = new Map(rows.map((v) => [v.id, { sellPrice: n(v.sellPrice), dealerPrice: n(v.dealerPrice) }]));

    const param: string | null = request.nextUrl.searchParams.get("locale");
    const locale: Locale = (LOCALES as readonly string[]).includes(param ?? "") ? (param as Locale) : "ru";

    let buffer: Buffer;
    try {
      const { renderImportReportPdf } = await import("@/lib/imports/importReportPdf");
      buffer = await renderImportReportPdf({ data, prices, dictionary: getDictionary(locale).imports, locale });
    } catch (e) {
      console.error("GET /api/admin/imports/[id]/report render:", e);
      // Super admins only: the reason helps fix a failing report without server logs.
      throw new ImportApiError(500, "report_failed", { detail: e instanceof Error ? e.message : String(e) });
    }

    const order: string = (data.supplierOrderNo ?? data.proformaNo ?? data.id.slice(0, 8)).replace(/[^\w.-]+/g, "_");
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Import_${order}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  });
}
