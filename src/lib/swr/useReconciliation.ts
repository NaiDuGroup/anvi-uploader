"use client";

import useSWR from "swr";
import { fetcher } from "./fetcher";
import type {
  SerializedBankStatement,
  SerializedBankTransaction,
} from "@/lib/reconciliation/serialize";
import type { MatchSuggestion } from "@/lib/reconciliation/autoMatch";
import type { BalanceReport, ClientStatement } from "@/lib/reconciliation/report";

export interface QueueRow {
  transaction: SerializedBankTransaction;
  suggestions: MatchSuggestion[];
  /** Buyer still has unpaid fiscal invoices — leftover is not a true overpay. */
  hasOpenReceivables?: boolean;
}

export function useBankStatements() {
  const { data, error, isLoading, mutate } = useSWR<{
    statements: SerializedBankStatement[];
  }>("/api/admin/bank-statements", fetcher, { revalidateOnFocus: false });
  return {
    statements: data?.statements ?? null,
    error,
    isLoading,
    mutate,
  };
}

export function useReconciliationQueue(
  statementId?: string,
  page = 1,
  pageSize = 50,
) {
  const params = new URLSearchParams();
  if (statementId) params.set("statementId", statementId);
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  const key = `/api/admin/reconciliation/queue?${params.toString()}`;
  const { data, error, isLoading, mutate } = useSWR<{
    rows: QueueRow[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }>(key, fetcher, { revalidateOnFocus: false, keepPreviousData: true });
  return {
    rows: data?.rows ?? null,
    total: data?.total ?? 0,
    totalPages: data?.totalPages ?? 1,
    error,
    isLoading,
    mutate,
  };
}

export function useDebtorReport() {
  const { data, error, isLoading, mutate } = useSWR<BalanceReport>(
    "/api/admin/reconciliation",
    fetcher,
    { revalidateOnFocus: false },
  );
  return {
    debtors: data?.debtors ?? null,
    creditors: data?.creditors ?? null,
    operational: data?.operational ?? null,
    summary: data?.summary ?? null,
    error,
    isLoading,
    mutate,
  };
}

export interface ReconClient {
  idno: string;
  name: string;
}

export function useReconClients() {
  const { data, error, isLoading } = useSWR<{ clients: ReconClient[] }>(
    "/api/admin/reconciliation/clients",
    fetcher,
    { revalidateOnFocus: false },
  );
  return { clients: data?.clients ?? null, error, isLoading };
}

export function useClientStatement(idno: string | null) {
  const { data, error, isLoading, mutate } = useSWR<{ statement: ClientStatement }>(
    idno ? `/api/admin/reconciliation/act/${encodeURIComponent(idno)}` : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  return { statement: data?.statement ?? null, error, isLoading, mutate };
}

export type LedgerDirectionFilter = "" | "CREDIT" | "DEBIT";

export interface LedgerTransaction extends SerializedBankTransaction {
  statementFileName: string | null;
}

export function useBankLedger(filters: {
  direction?: LedgerDirectionFilter;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
} = {}) {
  const {
    direction = "",
    dateFrom,
    dateTo,
    page = 1,
    pageSize = 50,
  } = filters;
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  if (direction) params.set("direction", direction);
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  const key = `/api/admin/bank-transactions?${params.toString()}`;
  const { data, error, isLoading, mutate } = useSWR<{
    transactions: LedgerTransaction[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }>(key, fetcher, { revalidateOnFocus: false, keepPreviousData: true });
  return {
    transactions: data?.transactions ?? null,
    total: data?.total ?? 0,
    totalPages: data?.totalPages ?? 1,
    error,
    isLoading,
    mutate,
  };
}

export function useBankStatementTransactions(id: string | null) {
  const { data, error, isLoading } = useSWR<{
    statement: SerializedBankStatement;
    transactions: SerializedBankTransaction[];
  }>(id ? `/api/admin/bank-statements/${id}` : null, fetcher, {
    revalidateOnFocus: false,
  });
  return {
    statement: data?.statement ?? null,
    transactions: data?.transactions ?? null,
    error,
    isLoading,
  };
}

export interface FiscalInvoiceRow {
  id: string;
  seria: string;
  number: string;
  fullNumber: string;
  status: number;
  issueDate: string | null;
  totalAmount: string | null;
  vatAmount?: string | null;
  currency: string;
  buyerName: string | null;
  buyerIdno: string | null;
  clientName: string | null;
  paidAt: string | null;
  receiptRef?: string | null;
  receiptMethod?: string | null;
  receiptSettledAt?: string | null;
  receiptPhotoKey?: string | null;
  /** e-Factura `<Redirections>` / creation reason (e.g. Non-livrare). */
  redirections?: string | null;
  lastSyncedAt: string;
}

export interface FiscalInvoiceFilters {
  query?: string;
  page?: number;
  pageSize?: number;
  /** Collapsed bucket: signed | awaiting_signature | rejected | cancelled | draft */
  statusBucket?:
    | "signed"
    | "awaiting_signature"
    | "rejected"
    | "cancelled"
    | "draft"
    | null;
  /** @deprecated Prefer statusBucket */
  status?: number | null;
  /** terminal = receiptSettledAt; transfer = paidAt without receipt; unpaid = both null */
  payment?: "terminal" | "transfer" | "unpaid" | null;
  dateFrom?: string;
  dateTo?: string;
}

export interface FiscalInvoiceLine {
  name: string | null;
  unit: string | null;
  quantity: string | null;
  unitPrice: string | null;
  totalWithoutVat: string | null;
  vatRate: string | null;
  vatAmount: string | null;
  total: string | null;
}

export interface FiscalAllocation {
  id: string;
  amount: string;
  matchedBy: string;
  confidence: number | null;
  note: string | null;
  createdAt: string;
  transaction: {
    id: string;
    bookingDate: string;
    amount: string;
    currency: string;
    counterpartyName: string | null;
    purpose: string | null;
    documentNumber: string | null;
  } | null;
}

export interface FiscalInvoiceDetail {
  invoice: FiscalInvoiceRow;
  lines: FiscalInvoiceLine[];
  hasXml: boolean;
  oid: string | null;
  allocatedTotal: string;
  allocations: FiscalAllocation[];
}

export function useFiscalInvoiceDetail(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR<FiscalInvoiceDetail>(
    id ? `/api/admin/fiscal-invoices/${id}` : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  return { detail: data ?? null, error, isLoading, mutate };
}

export function useFiscalInvoices({
  query,
  page = 1,
  pageSize = 25,
  statusBucket = null,
  status = null,
  payment = null,
  dateFrom,
  dateTo,
}: FiscalInvoiceFilters = {}) {
  const params = new URLSearchParams();
  if (query?.trim()) params.set("q", query.trim());
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  if (statusBucket) {
    params.set("statusBucket", statusBucket);
  } else if (status !== null && status !== undefined) {
    params.set("status", String(status));
  }
  if (payment) params.set("payment", payment);
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  const key = `/api/admin/fiscal-invoices?${params.toString()}`;
  const { data, error, isLoading, mutate } = useSWR<{
    live: boolean;
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    fiscalInvoices: FiscalInvoiceRow[];
  }>(key, fetcher, { revalidateOnFocus: false, keepPreviousData: true });
  return {
    live: data?.live ?? false,
    fiscalInvoices: data?.fiscalInvoices ?? null,
    total: data?.total ?? 0,
    totalPages: data?.totalPages ?? 1,
    error,
    isLoading,
    mutate,
  };
}
