import { Prisma } from "@prisma/client";

/** Prisma include for a bank transaction with its allocations + targets. */
export const BANK_TRANSACTION_INCLUDE = {
  allocations: {
    include: {
      fiscalInvoice: {
        select: {
          id: true,
          seria: true,
          number: true,
          totalAmount: true,
          currency: true,
          buyerName: true,
          buyerIdno: true,
        },
      },
      invoice: {
        select: { id: true, number: true, status: true },
      },
    },
  },
} satisfies Prisma.BankTransactionInclude;

export type BankTransactionWithAllocations = Prisma.BankTransactionGetPayload<{
  include: typeof BANK_TRANSACTION_INCLUDE;
}>;

export const BANK_STATEMENT_INCLUDE = {
  uploadedBy: { select: { id: true, name: true, displayName: true } },
  _count: { select: { transactions: true } },
} satisfies Prisma.BankStatementInclude;

export type BankStatementWithMeta = Prisma.BankStatementGetPayload<{
  include: typeof BANK_STATEMENT_INCLUDE;
}>;

export interface SerializedAllocation {
  id: string;
  fiscalInvoiceId: string | null;
  fiscalNumber: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  targetLabel: string;
  clientName: string;
  amount: string;
  matchedBy: string;
  confidence: number | null;
  note: string | null;
  createdAt: string;
}

export interface SerializedBankTransaction {
  id: string;
  statementId: string;
  bookingDate: string;
  valueDate: string | null;
  direction: string;
  amount: string;
  currency: string;
  counterpartyName: string | null;
  counterpartyIdno: string | null;
  counterpartyIban: string | null;
  purpose: string | null;
  documentNumber: string | null;
  bankRef: string | null;
  txTypeCode: string | null;
  matchStatus: string;
  historicalDocument: string | null;
  allocatedAmount: string;
  unallocatedAmount: string;
  allocations: SerializedAllocation[];
  createdAt: string;
}

export interface SerializedBankStatement {
  id: string;
  fileName: string;
  format: string;
  accountIban: string | null;
  openingBalance: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  currency: string;
  status: string;
  rowCount: number;
  transactionCount: number;
  uploadedByName: string | null;
  errorReport: { line: number; message: string }[] | null;
  createdAt: string;
}

export function toSerializableAllocation(
  a: BankTransactionWithAllocations["allocations"][number],
): SerializedAllocation {
  const fiscalNumber = a.fiscalInvoice
    ? `${a.fiscalInvoice.seria}${a.fiscalInvoice.number}`
    : null;
  return {
    id: a.id,
    fiscalInvoiceId: a.fiscalInvoiceId,
    fiscalNumber,
    invoiceId: a.invoiceId,
    invoiceNumber: a.invoice?.number ?? null,
    targetLabel: fiscalNumber ?? (a.invoice?.number ? `#${a.invoice.number}` : "—"),
    clientName: a.fiscalInvoice?.buyerName?.trim() || "—",
    amount: a.amount.toString(),
    matchedBy: a.matchedBy,
    confidence: a.confidence,
    note: a.note,
    createdAt: a.createdAt.toISOString(),
  };
}

export function toSerializableBankTransaction(
  tx: BankTransactionWithAllocations,
): SerializedBankTransaction {
  const allocations = tx.allocations.map(toSerializableAllocation);
  const allocated = tx.allocations.reduce(
    (sum, a) => sum.plus(a.amount),
    new Prisma.Decimal(0),
  );
  const unallocated = tx.amount.minus(allocated);
  return {
    id: tx.id,
    statementId: tx.statementId,
    bookingDate: tx.bookingDate.toISOString(),
    valueDate: tx.valueDate ? tx.valueDate.toISOString() : null,
    direction: tx.direction,
    amount: tx.amount.toString(),
    currency: tx.currency,
    counterpartyName: tx.counterpartyName,
    counterpartyIdno: tx.counterpartyIdno,
    counterpartyIban: tx.counterpartyIban,
    purpose: tx.purpose,
    documentNumber: tx.documentNumber,
    bankRef: tx.bankRef,
    txTypeCode: tx.txTypeCode,
    matchStatus: tx.matchStatus,
    historicalDocument: tx.historicalDocument ?? null,
    allocatedAmount: allocated.toFixed(2),
    unallocatedAmount: unallocated.toFixed(2),
    allocations,
    createdAt: tx.createdAt.toISOString(),
  };
}

export function toSerializableBankStatement(
  s: BankStatementWithMeta,
): SerializedBankStatement {
  const report = Array.isArray(s.errorReport)
    ? (s.errorReport as unknown as { line: number; message: string }[])
    : null;
  return {
    id: s.id,
    fileName: s.fileName,
    format: s.format,
    accountIban: s.accountIban,
    openingBalance: s.openingBalance ? s.openingBalance.toString() : null,
    periodFrom: s.periodFrom ? s.periodFrom.toISOString() : null,
    periodTo: s.periodTo ? s.periodTo.toISOString() : null,
    currency: s.currency,
    status: s.status,
    rowCount: s.rowCount,
    transactionCount: s._count.transactions,
    uploadedByName: s.uploadedBy?.displayName || s.uploadedBy?.name || null,
    errorReport: report,
    createdAt: s.createdAt.toISOString(),
  };
}
