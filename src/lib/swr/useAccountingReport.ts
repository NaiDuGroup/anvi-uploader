"use client";

import useSWR from "swr";
import { fetcher } from "./fetcher";

export interface AccountingReportOrder {
  id: string;
  orderNumber: number;
  createdAt: string;
  customerLabel: string | null;
  revenue: number;
  productPurchaseCosts: number;
  productionCosts: number;
  allocatedExpenses: number;
  taxes: number;
  netProfit: number;
  profitMarginPct: number;
  missingProductCost: boolean;
}

export interface AccountingExpenseRow {
  id: string;
  name: string;
  type: string;
  amount: number;
  period: string;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  notes: string | null;
  accruedInRange: number;
}

export interface AccountingSummary {
  revenue: number;
  productPurchaseCosts: number;
  productionCosts: number;
  allocatedExpenses: number;
  taxes: number;
  netProfit: number;
  profitMarginPct: number;
}

interface AccountingReportResponse {
  currency: string;
  summary: AccountingSummary;
  orders: AccountingReportOrder[];
  expensesBreakdown: AccountingExpenseRow[];
}

export function useAccountingReport(dateFrom: string, dateTo: string) {
  const shouldFetch = dateFrom && dateTo;
  const params = new URLSearchParams({ from: dateFrom, to: dateTo });
  const key = shouldFetch ? `/api/admin/accounting/report?${params}` : null;

  const { data, error, isLoading, mutate } = useSWR<AccountingReportResponse>(
    key,
    fetcher,
    {
      dedupingInterval: 5000,
      revalidateOnFocus: false,
    },
  );

  return {
    currency: data?.currency ?? "MDL",
    summary: data?.summary ?? null,
    orders: data?.orders ?? null,
    expensesBreakdown: data?.expensesBreakdown ?? [],
    error,
    isLoading,
    mutate,
  };
}
