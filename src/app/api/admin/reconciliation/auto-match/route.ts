import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { autoMatchSchema } from "@/lib/validations";
import { runAutoMatch } from "@/lib/reconciliation/autoMatch";
import { pullInvoicesFromBankReferences } from "@/lib/efactura/sync";
import { isEFacturaLive } from "@/lib/efactura";
import { prisma } from "@/lib/prisma";
import { actorOf, writeAudit, type AuditEntry } from "@/lib/settlements/audit";

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
    // matching if SFS is slow/throttling: the pull has a hard time budget
    // (PULL_REFERENCES_BUDGET_MS) so the button always gets a quick answer.
    let pull: Awaited<ReturnType<typeof pullInvoicesFromBankReferences>> | null =
      null;
    if ((validated.pullReferenced ?? true) && isEFacturaLive()) {
      try {
        pull = await pullInvoicesFromBankReferences({
          statementId: validated.statementId,
        });
        if (pull.timedOut) {
          console.warn(
            `pull-on-reference: time budget spent, ${pull.skipped} of ${pull.tokensSeen} references left for next run (continuing)`,
          );
        }
      } catch (err) {
        console.error("pull-on-reference failed (continuing):", err);
      }
    }

    const startedAt = new Date();
    const result = await runAutoMatch({
      statementId: validated.statementId,
      autoApply: validated.autoApply ?? true,
    });
    await logAutoMatch(actorOf(user), startedAt, result);
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

/** Journal: one summary entry per run + one per allocation it created. */
async function logAutoMatch(
  actor: ReturnType<typeof actorOf>,
  startedAt: Date,
  result: Awaited<ReturnType<typeof runAutoMatch>>,
): Promise<void> {
  try {
    const created = await prisma.paymentAllocation.findMany({
      where: { matchedBy: "AUTO", createdAt: { gte: startedAt } },
      select: {
        id: true,
        amount: true,
        confidence: true,
        bankTransactionId: true,
        bankTransaction: { select: { counterpartyIdno: true, documentNumber: true } },
        fiscalInvoice: { select: { id: true, seria: true, number: true, buyerIdno: true } },
      },
      take: 2000,
    });
    const entries: AuditEntry[] = created.map((a) => ({
      action: "auto_match",
      entityType: "bank_transaction",
      entityId: a.bankTransactionId,
      counterpartyIdno: a.fiscalInvoice?.buyerIdno ?? a.bankTransaction.counterpartyIdno,
      amount: a.amount.toFixed(2),
      details: {
        fiscalInvoiceId: a.fiscalInvoice?.id ?? null,
        document: a.fiscalInvoice ? `${a.fiscalInvoice.seria}${a.fiscalInvoice.number}` : null,
        paymentDocument: a.bankTransaction.documentNumber,
        confidence: a.confidence,
      },
    }));
    entries.unshift({
      action: "auto_match",
      entityType: "run",
      details: { ...result, created: created.length },
    });
    await writeAudit(actor, entries);
  } catch (error) {
    console.error("auto-match journal failed:", error);
  }
}
