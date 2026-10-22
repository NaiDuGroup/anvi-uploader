"use client";

import { formatAmountInput } from "@/lib/money";
import { useLanguageStore } from "@/stores/useLanguageStore";

/**
 * Unit COGS cell for piece catalogs: weighted-average receipt cost, or the
 * manual catalog cost (flagged) until the first detailed receipt exists.
 */
export function CatalogUnitCost({
  avgPurchaseCost,
  purchaseCost,
}: {
  avgPurchaseCost: number | null;
  purchaseCost: number | null;
}) {
  const { t } = useLanguageStore();

  if (avgPurchaseCost != null) {
    return (
      <span className="tabular-nums" title={t.admin.catalogStockAvgCostHint}>
        {formatAmountInput(avgPurchaseCost)}
      </span>
    );
  }
  if (purchaseCost != null) {
    return (
      <span className="tabular-nums">
        {formatAmountInput(purchaseCost)}
        <span className="ml-1 text-[10px] text-gray-400">
          {t.admin.catalogStockCostFromCatalog}
        </span>
      </span>
    );
  }
  return <span>—</span>;
}
