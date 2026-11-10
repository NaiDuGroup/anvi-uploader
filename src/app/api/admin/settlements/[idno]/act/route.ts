import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { buildSettlementAct } from "@/lib/settlements/act";
import { parseIdno } from "@/lib/settlements/guard";
import { actFileName, pdfContentDisposition } from "@/lib/settlements/http";
import { loadSettlementLedger } from "@/lib/settlements/load";
import { actPeriodStart, parseSettlementPeriod } from "@/lib/settlements/period";

export const runtime = "nodejs";

/** «Акт сверки взаиморасчётов» PDF, both sides: `?from=&to=&locale=ru|ro`. */
export async function GET(request: Request, { params }: { params: Promise<{ idno: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const idno = parseIdno((await params).idno);
  if (!idno) {
    return NextResponse.json({ error: "invalid_idno" }, { status: 400 });
  }
  const url = new URL(request.url);
  const period = parseSettlementPeriod(url.searchParams.get("from"), url.searchParams.get("to"));
  const locale = url.searchParams.get("locale") === "ro" ? "ro" : "ru";

  try {
    const ledger = await loadSettlementLedger(idno, period);
    const act = buildSettlementAct(ledger);
    const firstDay = actPeriodStart(period, ledger.entries, ledger.openingBalance?.asOfDate ?? null);

    const { renderSettlementActPdf } = await import("@/lib/settlements/actPdf");
    const buffer = await renderSettlementActPdf({
      idno,
      name: ledger.name,
      period,
      firstDay,
      act,
      locale,
    });
    const file = actFileName("act-sverki", ledger.name === "—" ? null : ledger.name, idno);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": pdfContentDisposition(file.ascii, file.utf8),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("GET /api/admin/settlements/[idno]/act:", error);
    return NextResponse.json({ error: "Failed to render act" }, { status: 500 });
  }
}
