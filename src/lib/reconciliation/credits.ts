/**
 * Attribution of incoming bank money to the party it actually settles.
 *
 * Reconciliation views used to net money strictly by the payer's fiscal code.
 * That breaks whenever one legal entity pays an invoice issued to another
 * (common for affiliated firms): the buyer stayed a debtor and the payer
 * showed a phantom overpayment, and a manual match could not fix it because
 * `PaymentAllocation` rows were never read back.
 *
 * Here an allocation moves its amount onto the target invoice's buyer; only
 * the unallocated remainder stays with the payer.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { extractInvoiceRefs, splitFiscalToken } from "./match";

const ZERO = new Prisma.Decimal(0);

type Db = typeof prisma | Prisma.TransactionClient;

export interface CreditAttribution {
  /** Incoming money credited to each buyer fiscal code, net of refunds. */
  paidByIdno: Map<string, Prisma.Decimal>;
  /** The refund share already deducted from `paidByIdno`, per buyer. */
  refundedByIdno: Map<string, Prisma.Decimal>;
  /**
   * Synthetic debit for pre-e-Factura settlements, per payer. Only the
   * unallocated part counts — an allocated HISTORICAL credit is already
   * balanced by the debit of the invoice it was matched to.
   */
  historicalByIdno: Map<string, Prisma.Decimal>;
}

function add(
  map: Map<string, Prisma.Decimal>,
  key: string,
  amount: Prisma.Decimal,
): void {
  map.set(key, (map.get(key) ?? ZERO).plus(amount));
}

/**
 * A fiscal receipt (B/f) credit is a stand-in for money that never reached the
 * bank account. When real bank money already covers the buyer's debits, that
 * stand-in is a duplicate and would fake an overpayment — so it is capped by
 * whatever the bank has not covered yet, and can never go negative.
 */
export function clampReceiptCredit(
  receiptEligible: Prisma.Decimal,
  debits: Prisma.Decimal,
  bankPaid: Prisma.Decimal,
): Prisma.Decimal {
  const uncovered = debits.minus(bankPaid);
  if (uncovered.lessThanOrEqualTo(ZERO)) return ZERO;
  return Prisma.Decimal.min(receiptEligible, uncovered);
}

/** One outgoing transfer, or part of it, that gives a buyer their money back. */
export interface RefundEntry {
  /** Buyer whose balance the refund belongs to. */
  ownerIdno: string;
  amount: Prisma.Decimal;
  transaction: {
    id: string;
    bookingDate: Date;
    amount: Prisma.Decimal;
    documentNumber: string | null;
    purpose: string | null;
    counterpartyIdno: string | null;
    counterpartyName: string | null;
  };
}

/**
 * Finds outgoing transfers that return money to a buyer.
 *
 * Most of what we pay out goes to suppliers, and several suppliers are also
 * clients — so a debit is only a refund when it carries proof of one:
 *  - an allocation to a fiscal invoice, i.e. an accountant said so, or
 *  - a purpose citing one of our own sales invoices issued to that very
 *    counterparty, which nothing but a refund would ever reference.
 */
export async function loadRefunds(
  db: Db = prisma,
  ownerIdno?: string,
): Promise<RefundEntry[]> {
  const debits = await db.bankTransaction.findMany({
    where: {
      direction: "DEBIT",
      ...(ownerIdno
        ? {
            OR: [
              { counterpartyIdno: ownerIdno },
              { allocations: { some: { fiscalInvoice: { buyerIdno: ownerIdno } } } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      bookingDate: true,
      amount: true,
      documentNumber: true,
      purpose: true,
      counterpartyIdno: true,
      counterpartyName: true,
      allocations: {
        where: { fiscalInvoiceId: { not: null } },
        select: { amount: true, fiscalInvoice: { select: { buyerIdno: true } } },
      },
    },
  });

  const citedByTx = new Map<string, string[]>();
  const tokenParts = new Map<string, { seria: string; number: string }>();
  for (const tx of debits) {
    if (!tx.counterpartyIdno) continue;
    const tokens = extractInvoiceRefs(tx.purpose).fiscalTokens;
    if (tokens.length === 0) continue;
    citedByTx.set(tx.id, tokens);
    for (const token of tokens) {
      const parts = splitFiscalToken(token);
      if (parts) tokenParts.set(token, parts);
    }
  }

  const citedInvoices =
    tokenParts.size === 0
      ? []
      : await db.fiscalInvoice.findMany({
          where: { OR: [...tokenParts.values()] },
          select: { seria: true, number: true, buyerIdno: true },
        });
  const buyerByToken = new Map(
    citedInvoices.map((i) => [`${i.seria}${i.number}`, i.buyerIdno]),
  );

  const refunds: RefundEntry[] = [];
  for (const { allocations, ...transaction } of debits) {
    let rest = transaction.amount;
    for (const a of allocations) {
      const owner = a.fiscalInvoice?.buyerIdno;
      if (!owner) continue;
      refunds.push({ ownerIdno: owner, amount: a.amount, transaction });
      rest = rest.minus(a.amount);
    }

    const idno = transaction.counterpartyIdno;
    if (!idno || rest.lessThanOrEqualTo(ZERO)) continue;
    const tokens = citedByTx.get(transaction.id) ?? [];
    if (!tokens.some((t) => buyerByToken.get(t) === idno)) continue;
    refunds.push({ ownerIdno: idno, amount: rest, transaction });
  }
  return refunds;
}

/** Loads credit attribution across every incoming transaction. */
export async function loadCreditAttribution(
  db: Db = prisma,
): Promise<CreditAttribution> {
  const [credits, allocations, refunds] = await Promise.all([
    db.bankTransaction.findMany({
      where: { direction: "CREDIT" },
      select: {
        id: true,
        amount: true,
        counterpartyIdno: true,
        matchStatus: true,
      },
    }),
    db.paymentAllocation.findMany({
      where: { fiscalInvoiceId: { not: null } },
      select: {
        bankTransactionId: true,
        amount: true,
        bankTransaction: { select: { direction: true } },
        fiscalInvoice: { select: { buyerIdno: true } },
      },
    }),
    loadRefunds(db),
  ]);

  const paidByIdno = new Map<string, Prisma.Decimal>();
  const refundedByIdno = new Map<string, Prisma.Decimal>();
  const historicalByIdno = new Map<string, Prisma.Decimal>();
  const allocatedByTx = new Map<string, Prisma.Decimal>();

  for (const a of allocations) {
    // Outgoing allocations are refunds and are handled below, not here.
    if (a.bankTransaction.direction !== "CREDIT") continue;
    add(allocatedByTx, a.bankTransactionId, a.amount);
    const owner = a.fiscalInvoice?.buyerIdno;
    if (owner) add(paidByIdno, owner, a.amount);
  }

  for (const tx of credits) {
    if (!tx.counterpartyIdno) continue;
    const rest = tx.amount.minus(allocatedByTx.get(tx.id) ?? ZERO);
    if (rest.lessThanOrEqualTo(ZERO)) continue;
    add(paidByIdno, tx.counterpartyIdno, rest);
    if (tx.matchStatus === "HISTORICAL") {
      add(historicalByIdno, tx.counterpartyIdno, rest);
    }
  }

  for (const r of refunds) {
    add(refundedByIdno, r.ownerIdno, r.amount);
    add(paidByIdno, r.ownerIdno, r.amount.negated());
  }

  return { paidByIdno, refundedByIdno, historicalByIdno };
}
