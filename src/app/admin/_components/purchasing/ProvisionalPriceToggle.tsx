"use client";

import { useLanguageStore } from "@/stores/useLanguageStore";
import { formatAmountInput } from "@/lib/money";

/**
 * Estimated receipt total at the last known unit cost, as an input string.
 * Integer-MDL ledgers (roll media, sheet paper, ink) get whole lei.
 */
export function provisionalTotalInput(
  quantity: number | null,
  unitCost: number | null,
  wholeMdl: boolean,
): string {
  if (quantity == null || unitCost == null || !(quantity > 0)) return "";
  const total: number = quantity * unitCost;
  return wholeMdl ? String(Math.round(total)) : total.toFixed(2);
}

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Current weighted-average (or catalog) unit cost; null when never purchased. */
  unitCost: number | null;
  disabled?: boolean;
};

/** «Price not known yet» switch for receipts entered before the supplier invoice. */
export default function ProvisionalPriceToggle({ checked, onChange, unitCost, disabled }: Props) {
  const { t } = useLanguageStore();
  const p = t.purchases;
  const available: boolean = unitCost != null && unitCost > 0;

  return (
    <div className="text-xs text-gray-600">
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={checked}
          disabled={disabled || !available}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>
          {available && unitCost != null
            ? p.provisionalToggle(formatAmountInput(unitCost))
            : p.provisionalNoPrice}
        </span>
      </label>
      {checked && <p className="mt-1 pl-5 text-amber-700">{p.provisionalHint}</p>}
    </div>
  );
}
