"use client";

import { useState } from "react";
import { Loader2, PackagePlus, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GarmentProductJson } from "@/lib/dtf/dtfDto";
import { cn } from "@/lib/utils";
import { useLanguageStore } from "@/stores/useLanguageStore";
import GarmentForm from "./GarmentForm";
import GarmentReceiptForm from "./GarmentReceiptForm";
import { dtfErrorText, formatNumber } from "@/lib/dtf/dtfClientApi";
import { useDtfGarments } from "@/lib/swr";

type Panel =
  | { kind: "none" }
  | { kind: "create" }
  | { kind: "edit"; garmentId: string }
  | { kind: "receipt"; garmentId: string };

export default function GarmentsTab() {
  const { t, locale } = useLanguageStore();
  const g = t.dtf.garments;
  const { data, error: loadError, isLoading: loading, mutate } = useDtfGarments();
  const items: GarmentProductJson[] = data?.items ?? [];
  const error: string | null = loadError ? dtfErrorText(loadError, t) : null;
  const [showInactive, setShowInactive] = useState<boolean>(false);
  const [panel, setPanel] = useState<Panel>({ kind: "none" });

  function afterSave(): void {
    setPanel({ kind: "none" });
    void mutate();
  }

  const visible: GarmentProductJson[] = items.filter((p) => showInactive || p.isActive);

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          {g.showInactive}
        </label>
        <Button type="button" onClick={() => setPanel({ kind: "create" })}>
          <Plus className="mr-1.5 h-4 w-4" />
          {g.add}
        </Button>
      </div>

      {panel.kind === "create" && (
        <div className="mb-4">
          <GarmentForm garment={null} onSaved={afterSave} onCancel={() => setPanel({ kind: "none" })} />
        </div>
      )}

      {loading && items.length === 0 && (
        <p className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t.dtf.stock.loading}
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!loading && !error && visible.length === 0 && (
        <p className="rounded-xl border border-dashed border-gray-300 p-6 text-sm text-gray-500">{g.empty}</p>
      )}

      <ul className="grid gap-4">
        {visible.map((p) => {
          const total: number = p.variants.reduce((sum, v) => sum + v.stockQuantity, 0);
          const basePrice: number | undefined = p.priceTiers[0]?.priceMdl;
          return (
            <li
              key={p.id}
              className={cn(
                "rounded-2xl border border-gray-200 bg-white p-4 shadow-sm",
                !p.isActive && "opacity-60",
              )}
            >
              {panel.kind === "edit" && panel.garmentId === p.id ? (
                <GarmentForm garment={p} onSaved={afterSave} onCancel={() => setPanel({ kind: "none" })} />
              ) : (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span
                        className="h-8 w-8 shrink-0 rounded-full border border-gray-300"
                        style={{ backgroundColor: p.colorHex ?? "#ffffff" }}
                        aria-hidden
                      />
                      <div>
                        <p className="font-semibold text-gray-900">
                          {p.name} · {p.colorName}
                          {!p.isActive && (
                            <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-normal text-gray-500">
                              {g.inactiveBadge}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500">
                          {t.dtf.garmentKinds[p.kind]} · {g.totalPieces(total)}
                          {basePrice != null && ` · ${g.priceFrom(`${formatNumber(basePrice, locale)} MDL`)}`}
                          {p.priceTiers.length > 1 &&
                            ` (${p.priceTiers
                              .slice(1)
                              .map((tier) => `${tier.minQty}+ ${formatNumber(tier.priceMdl, locale)}`)
                              .join(" · ")})`}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setPanel({ kind: "receipt", garmentId: p.id })}
                      >
                        <PackagePlus className="mr-1.5 h-4 w-4" />
                        {g.receive}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setPanel({ kind: "edit", garmentId: p.id })}
                      >
                        <Pencil className="mr-1.5 h-4 w-4" />
                        {g.edit}
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {p.variants.map((v) => (
                      <div
                        key={v.id}
                        className={cn(
                          "min-w-[4.5rem] rounded-lg border px-2.5 py-1.5 text-center",
                          v.stockQuantity > 0
                            ? "border-gray-200 bg-gray-50"
                            : v.stockQuantity < 0
                              ? "border-red-200 bg-red-50"
                              : "border-dashed border-gray-200",
                        )}
                      >
                        <p className="text-xs font-semibold text-gray-700">{v.size}</p>
                        <p
                          className={cn(
                            "text-base font-bold tabular-nums",
                            v.stockQuantity < 0 ? "text-red-700" : "text-gray-900",
                          )}
                        >
                          {v.stockQuantity}
                        </p>
                        {v.unitCostMdl != null && (
                          <p className="text-[11px] text-gray-500 tabular-nums">
                            {formatNumber(v.unitCostMdl, locale)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  {panel.kind === "receipt" && panel.garmentId === p.id && (
                    <GarmentReceiptForm
                      garment={p}
                      onSaved={afterSave}
                      onCancel={() => setPanel({ kind: "none" })}
                    />
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
