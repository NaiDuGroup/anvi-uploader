import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { buildSettlementAct } from "@/lib/settlements/act";
import { loadSettlementLedger } from "@/lib/settlements/load";
import { entryDay, parseSettlementPeriod } from "@/lib/settlements/period";

export const runtime = "nodejs";

/** «Акт сверки взаиморасчётов» PDF, both sides: `?from=&to=&locale=ru|ro`. */
export async function GET(request: Request, { params }: { params: Promise<{ idno: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { idno: raw } = await params;
  const idno = decodeURIComponent(raw).trim();
  if (!idno || idno.length > 64) {
    return NextResponse.json({ error: "invalid_idno" }, { status: 400 });
  }
  const url = new URL(request.url);
  const period = parseSettlementPeriod(url.searchParams.get("from"), url.searchParams.get("to"));
  const locale = url.searchParams.get("locale") === "ro" ? "ro" : "ru";

  try {
    const ledger = await loadSettlementLedger(idno, period);
    const act = buildSettlementAct(ledger);
    const firstDated = ledger.entries.find((e) => e.date);
    const firstDay =
      ledger.openingBalance?.asOfDate ?? (firstDated ? entryDay(firstDated) : null);

    const { renderSettlementActPdf } = await import("@/lib/settlements/actPdf");
    const buffer = await renderSettlementActPdf({
      idno,
      name: ledger.name,
      period,
      firstDay,
      act,
      locale,
    });
    const safeName = ledger.name.replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 40) || idno;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="act-sverki-${encodeURIComponent(safeName)}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("GET /api/admin/settlements/[idno]/act:", error);
    return NextResponse.json({ error: "Failed to render act" }, { status: 500 });
  }
}
