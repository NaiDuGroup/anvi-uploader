import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { autoMatchSchema } from "@/lib/validations";
import { runAutoMatch } from "@/lib/reconciliation/autoMatch";
import { pullInvoicesFromBankReferences } from "@/lib/efactura/sync";
import { isEFacturaLive } from "@/lib/efactura";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const validated = autoMatchSchema.parse(body ?? {});

    // Pull-on-reference: fetch fiscal invoices cited in the bank purposes that
    // we don't mirror yet, so they can be matched. Best-effort — never block
    // matching if SFS is slow/throttling.
    let pull = null;
    if ((validated.pullReferenced ?? true) && isEFacturaLive()) {
      try {
        pull = await pullInvoicesFromBankReferences({
          statementId: validated.statementId,
        });
      } catch (err) {
        console.error("pull-on-reference failed (continuing):", err);
      }
    }

    const result = await runAutoMatch({
      statementId: validated.statementId,
      autoApply: validated.autoApply ?? true,
    });
    return NextResponse.json({ result, pull });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.flatten() },
        { status: 400 },
      );
    }
    console.error("POST /api/admin/reconciliation/auto-match:", error);
    return NextResponse.json({ error: "Auto-match failed" }, { status: 500 });
  }
}
