import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOrCreateCompanyProfile } from "@/lib/invoice/companyProfile";
import { ISSUED_EFACTURA_STATUSES } from "@/lib/efactura/types";
import {
  excludeNonDeliveryWhere,
  isNonDeliveryFiscal,
} from "./fiscalFlags";
import { clampReceiptCredit, loadCreditAttribution } from "./credits";

const ZERO = new Prisma.Decimal(0);
/** Same tolerance as computeBalanceReport. */
export const ACT_BALANCE_TOLERANCE = new Prisma.Decimal("0.005");

/**
 * Returns buyer IDNOs whose act net balance is ~0
 * (invoiced + HISTORICAL synth − bank credits − receipt credits).
 */
export async function loadActBalancedIdnos(): Promise<Set<string>> {
  const company = await getOrCreateCompanyProfile();
  const ownIdno = company.fiscalCode;

  const [invoices, attribution] = await Promise.all([
    prisma.fiscalInvoice.findMany({
      where: {
        eFacturaStatus: { in: [...ISSUED_EFACTURA_STATUSES] },
        totalAmount: { not: null },
        AND: [excludeNonDeliveryWhere()],
      },
      select: {
        totalAmount: true,
        buyerIdno: true,
        receiptSettledAt: true,
        redirections: true,
      },
    }),
    loadCreditAttribution(),
  ]);

  const { paidByIdno, historicalByIdno } = attribution;

  type Acc = {
    invoiced: Prisma.Decimal;
    receiptEligible: Prisma.Decimal;
  };
  const byIdno = new Map<string, Acc>();
  for (const inv of invoices) {
    if (isNonDeliveryFiscal(inv.redirections)) continue;
    const key = inv.buyerIdno;
    if (!key) continue;
    let acc = byIdno.get(key);
    if (!acc) {
      acc = { invoiced: ZERO, receiptEligible: ZERO };
      byIdno.set(key, acc);
    }
    acc.invoiced = acc.invoiced.plus(inv.totalAmount ?? ZERO);
    if (inv.receiptSettledAt) {
      acc.receiptEligible = acc.receiptEligible.plus(inv.totalAmount ?? ZERO);
    }
  }

  for (const idno of paidByIdno.keys()) {
    if (!byIdno.has(idno)) {
      byIdno.set(idno, { invoiced: ZERO, receiptEligible: ZERO });
    }
  }

  const balanced = new Set<string>();
  for (const [idno, acc] of byIdno) {
    if (idno === ownIdno) continue;
    const bankPaid = paidByIdno.get(idno) ?? ZERO;
    const historical = historicalByIdno.get(idno) ?? ZERO;
    const debits = acc.invoiced.plus(historical);
    const paid = bankPaid.plus(
      clampReceiptCredit(acc.receiptEligible, debits, bankPaid),
    );
    const balance = debits.minus(paid);
    if (balance.abs().lessThanOrEqualTo(ACT_BALANCE_TOLERANCE)) {
      // Only settle when there was real movement (not empty clients).
      if (paid.greaterThan(ACT_BALANCE_TOLERANCE) || acc.invoiced.greaterThan(ACT_BALANCE_TOLERANCE)) {
        balanced.add(idno);
      }
    }
  }
  return balanced;
}

/**
 * Marks leftover UNMATCHED/SUGGESTED CREDITS for act-balanced buyers as
 * ACT_SETTLED so they leave the reconciliation queue. Idempotent.
 */
export async function settleActBalancedCredits(options?: {
  statementId?: string;
}): Promise<number> {
  const idnos = [...(await loadActBalancedIdnos())];
  if (idnos.length === 0) return 0;

  const result = await prisma.bankTransaction.updateMany({
    where: {
      direction: "CREDIT",
      counterpartyIdno: { in: idnos },
      matchStatus: { in: ["UNMATCHED", "SUGGESTED"] },
      ...(options?.statementId ? { statementId: options.statementId } : {}),
    },
    data: { matchStatus: "ACT_SETTLED" },
  });
  return result.count;
}
