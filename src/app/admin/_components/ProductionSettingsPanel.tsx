"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProductionCostsConfig } from "@/lib/accounting/types";

function sanitizeLfMarkupMultiplierInput(raw: string): string {
  const s = raw
    .replace(/,/g, ".")
    .replace(/[\u066B\u066C\u00B7\u2024\u2025\u2219\u22C5\uFF0E\uFE52\uFF61]/g, ".")
    .replace(/[^\d.]/g, "");
  const firstDot = s.indexOf(".");
  if (firstDot === -1) return s;
  return s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
}

function parseLfMarkupMultiplierInput(raw: string): number {
  const t = sanitizeLfMarkupMultiplierInput(raw.trim());
  if (t === "" || t === ".") return Number.NaN;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : Number.NaN;
}

function lfMarkupMultiplierToInputString(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return String(n);
}

function commitLfMarkupMultiplierDraft(
  draft: string,
  setDraft: (s: string) => void,
  applyProduction: (v: number) => void,
): void {
  const t = sanitizeLfMarkupMultiplierInput(draft.trim());
  if (t === "" || t === ".") {
    applyProduction(0);
    setDraft("0");
    return;
  }
  const n = Number.parseFloat(t);
  const v = Number.isFinite(n) && n >= 0 ? n : 0;
  applyProduction(v);
  if (/^\d+\.$/.test(t)) {
    setDraft(`${Math.trunc(v)}.`);
    return;
  }
  setDraft(lfMarkupMultiplierToInputString(v));
}

const emptyProduction = (): ProductionCostsConfig => ({
  mugPrintPerUnit: 0,
  notebookPrintPerUnit: 0,
  packagingPerOrder: 0,
  otherConsumablesPerOrder: 0,
  inkMlPerSqmLargeFormatRoll: 0,
  inkMlPerSqmUvRigid: 0,
  inkMlPerSqmDtfTextile: 0,
  minimumOrderPriceMdl: 0,
  lfMinimumLineTotalMdl: 0,
  lfRetailMarkupMultiplier: 0,
  lfDealerMarkupMultiplier: 0,
  lfInkRetailMarkupMultiplier: 0,
  lfInkDealerMarkupMultiplier: 0,
});

export type ProductionSettingsPanelHandle = {
  saveProduction: () => Promise<boolean>;
};

export type ProductionSettingsPanelProps = {
  saveUi?: "standalone" | "unified";
  onProductionReadyChange?: (ready: boolean) => void;
};

export const ProductionSettingsPanel = forwardRef<
  ProductionSettingsPanelHandle,
  ProductionSettingsPanelProps
>(function ProductionSettingsPanel(
  { saveUi = "standalone", onProductionReadyChange },
  ref,
) {
  const { t } = useLanguageStore();
  const ts = t.settings;
  const ac = t.accounting;

  const [production, setProduction] = useState<ProductionCostsConfig>(emptyProduction);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [productionStatus, setProductionStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  const [lfRetailMarkupInput, setLfRetailMarkupInput] = useState("0");
  const [lfDealerMarkupInput, setLfDealerMarkupInput] = useState("0");
  const [lfInkRetailMarkupInput, setLfInkRetailMarkupInput] = useState("0");
  const [lfInkDealerMarkupInput, setLfInkDealerMarkupInput] = useState("0");

  const applyProductionFromServer = useCallback((p: ProductionCostsConfig) => {
    setProduction(p);
    setLfRetailMarkupInput(lfMarkupMultiplierToInputString(p.lfRetailMarkupMultiplier));
    setLfDealerMarkupInput(lfMarkupMultiplierToInputString(p.lfDealerMarkupMultiplier));
    setLfInkRetailMarkupInput(lfMarkupMultiplierToInputString(p.lfInkRetailMarkupMultiplier));
    setLfInkDealerMarkupInput(lfMarkupMultiplierToInputString(p.lfInkDealerMarkupMultiplier));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch("/api/admin/accounting/settings", { credentials: "same-origin" });
      if (!res.ok) {
        setLoadError(true);
        return;
      }
      const data = (await res.json()) as { productionCosts: ProductionCostsConfig };
      applyProductionFromServer(data.productionCosts);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [applyProductionFromServer]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    onProductionReadyChange?.(!loading && !loadError);
  }, [loadError, loading, onProductionReadyChange]);

  const persistProduction = useCallback(async (): Promise<boolean> => {
    if (saveUi === "standalone") {
      setProductionStatus("saving");
    }
    const r = parseLfMarkupMultiplierInput(lfRetailMarkupInput);
    const d = parseLfMarkupMultiplierInput(lfDealerMarkupInput);
    const ir = parseLfMarkupMultiplierInput(lfInkRetailMarkupInput);
    const id = parseLfMarkupMultiplierInput(lfInkDealerMarkupInput);
    const lfRetailMarkupMultiplier = Number.isFinite(r) && r >= 0 ? r : 0;
    const lfDealerMarkupMultiplier = Number.isFinite(d) && d >= 0 ? d : 0;
    const lfInkRetailMarkupMultiplier = Number.isFinite(ir) && ir >= 0 ? ir : 0;
    const lfInkDealerMarkupMultiplier = Number.isFinite(id) && id >= 0 ? id : 0;
    const payload: ProductionCostsConfig = {
      ...production,
      lfRetailMarkupMultiplier,
      lfDealerMarkupMultiplier,
      lfInkRetailMarkupMultiplier,
      lfInkDealerMarkupMultiplier,
    };
    try {
      const res = await fetch("/api/admin/accounting/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        if (saveUi === "standalone") {
          setProductionStatus("error");
        }
        return false;
      }
      const data = (await res.json()) as { productionCosts: ProductionCostsConfig };
      applyProductionFromServer(data.productionCosts);
      if (saveUi === "standalone") {
        setProductionStatus("saved");
        setTimeout(() => setProductionStatus("idle"), 2000);
      }
      return true;
    } catch {
      if (saveUi === "standalone") {
        setProductionStatus("error");
      }
      return false;
    }
  }, [
    applyProductionFromServer,
    lfDealerMarkupInput,
    lfInkDealerMarkupInput,
    lfInkRetailMarkupInput,
    lfRetailMarkupInput,
    production,
    saveUi,
  ]);

  useImperativeHandle(
    ref,
    () => ({
      saveProduction: () => persistProduction(),
    }),
    [persistProduction],
  );

  const cardClass =
    "rounded-xl border border-gray-200/90 bg-white p-4 shadow-sm";

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-xl font-bold text-gray-900">{ts.productionSectionTitle}</h2>
      </header>

      {loadError ? (
        <p className="text-sm text-red-600">{ac.loadError}</p>
      ) : null}

      {loading ? (
        <p className="text-sm text-gray-500">{ac.loading}</p>
      ) : (
        <>
          <div className={cardClass}>
            <h3 className="text-sm font-semibold text-gray-900">
              {ts.productionSectionGeneral}
            </h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block text-xs text-gray-600">
                {ac.productionMugPrint}
                <Input
                  className="mt-1"
                  inputMode="numeric"
                  value={String(production.mugPrintPerUnit)}
                  onChange={(ev) =>
                    setProduction((p) => ({
                      ...p,
                      mugPrintPerUnit: Number.parseInt(ev.target.value, 10) || 0,
                    }))
                  }
                />
              </label>
              <label className="block text-xs text-gray-600">
                {ac.productionNotebookPrint}
                <Input
                  className="mt-1"
                  inputMode="numeric"
                  value={String(production.notebookPrintPerUnit)}
                  onChange={(ev) =>
                    setProduction((p) => ({
                      ...p,
                      notebookPrintPerUnit: Number.parseInt(ev.target.value, 10) || 0,
                    }))
                  }
                />
              </label>
              <label className="block text-xs text-gray-600">
                {ac.productionPackaging}
                <Input
                  className="mt-1"
                  inputMode="numeric"
                  value={String(production.packagingPerOrder)}
                  onChange={(ev) =>
                    setProduction((p) => ({
                      ...p,
                      packagingPerOrder: Number.parseInt(ev.target.value, 10) || 0,
                    }))
                  }
                />
              </label>
              <label className="block text-xs text-gray-600">
                {ac.productionOther}
                <Input
                  className="mt-1"
                  inputMode="numeric"
                  value={String(production.otherConsumablesPerOrder)}
                  onChange={(ev) =>
                    setProduction((p) => ({
                      ...p,
                      otherConsumablesPerOrder: Number.parseInt(ev.target.value, 10) || 0,
                    }))
                  }
                />
              </label>
              <label className="block text-xs text-gray-600 sm:col-span-2">
                {ac.productionMinimumOrderPrice}
                <Input
                  className="mt-1"
                  inputMode="numeric"
                  value={String(production.minimumOrderPriceMdl)}
                  onChange={(ev) =>
                    setProduction((p) => ({
                      ...p,
                      minimumOrderPriceMdl: Number.parseInt(ev.target.value, 10) || 0,
                    }))
                  }
                />
              </label>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className={cardClass}>
              <h3 className="text-sm font-semibold text-gray-900">
                {ts.productionSectionLf}
              </h3>
              <div className="mt-4 grid gap-3">
                <label className="block text-xs text-gray-600">
                  {ac.productionInkMlPerSqmLf}
                  <Input
                    className="mt-1"
                    inputMode="decimal"
                    value={String(production.inkMlPerSqmLargeFormatRoll)}
                    onChange={(ev) => {
                      const n = Number.parseFloat(ev.target.value.replace(",", "."));
                      setProduction((p) => ({
                        ...p,
                        inkMlPerSqmLargeFormatRoll:
                          Number.isFinite(n) && n >= 0 ? n : 0,
                      }));
                    }}
                  />
                </label>
                <label className="block text-xs text-gray-600">
                  {ac.productionLfMinimumLineTotalMdl}
                  <Input
                    className="mt-1"
                    inputMode="numeric"
                    value={String(production.lfMinimumLineTotalMdl)}
                    onChange={(ev) =>
                      setProduction((p) => ({
                        ...p,
                        lfMinimumLineTotalMdl: Number.parseInt(ev.target.value, 10) || 0,
                      }))
                    }
                  />
                </label>
                <label className="block text-xs text-gray-600">
                  {ac.productionLfRetailMarkupMultiplier}
                  <Input
                    className="mt-1"
                    type="text"
                    inputMode="decimal"
                    lang="en"
                    autoComplete="off"
                    value={lfRetailMarkupInput}
                    onChange={(ev) =>
                      setLfRetailMarkupInput(sanitizeLfMarkupMultiplierInput(ev.target.value))
                    }
                    onBlur={() =>
                      commitLfMarkupMultiplierDraft(
                        lfRetailMarkupInput,
                        setLfRetailMarkupInput,
                        (v) => setProduction((p) => ({ ...p, lfRetailMarkupMultiplier: v })),
                      )
                    }
                  />
                </label>
                <label className="block text-xs text-gray-600">
                  {ac.productionLfDealerMarkupMultiplier}
                  <Input
                    className="mt-1"
                    type="text"
                    inputMode="decimal"
                    lang="en"
                    autoComplete="off"
                    value={lfDealerMarkupInput}
                    onChange={(ev) =>
                      setLfDealerMarkupInput(sanitizeLfMarkupMultiplierInput(ev.target.value))
                    }
                    onBlur={() =>
                      commitLfMarkupMultiplierDraft(
                        lfDealerMarkupInput,
                        setLfDealerMarkupInput,
                        (v) => setProduction((p) => ({ ...p, lfDealerMarkupMultiplier: v })),
                      )
                    }
                  />
                </label>
                <p className="text-[11px] leading-snug text-gray-600">
                  {ac.productionLfInkMarkupMultiplierHint}
                </p>
                <label className="block text-xs text-gray-600">
                  {ac.productionLfInkRetailMarkupMultiplier}
                  <Input
                    className="mt-1"
                    type="text"
                    inputMode="decimal"
                    lang="en"
                    autoComplete="off"
                    value={lfInkRetailMarkupInput}
                    onChange={(ev) =>
                      setLfInkRetailMarkupInput(sanitizeLfMarkupMultiplierInput(ev.target.value))
                    }
                    onBlur={() =>
                      commitLfMarkupMultiplierDraft(
                        lfInkRetailMarkupInput,
                        setLfInkRetailMarkupInput,
                        (v) => setProduction((p) => ({ ...p, lfInkRetailMarkupMultiplier: v })),
                      )
                    }
                  />
                </label>
                <label className="block text-xs text-gray-600">
                  {ac.productionLfInkDealerMarkupMultiplier}
                  <Input
                    className="mt-1"
                    type="text"
                    inputMode="decimal"
                    lang="en"
                    autoComplete="off"
                    value={lfInkDealerMarkupInput}
                    onChange={(ev) =>
                      setLfInkDealerMarkupInput(sanitizeLfMarkupMultiplierInput(ev.target.value))
                    }
                    onBlur={() =>
                      commitLfMarkupMultiplierDraft(
                        lfInkDealerMarkupInput,
                        setLfInkDealerMarkupInput,
                        (v) => setProduction((p) => ({ ...p, lfInkDealerMarkupMultiplier: v })),
                      )
                    }
                  />
                </label>
              </div>
            </div>

            <div className={cardClass}>
              <h3 className="text-sm font-semibold text-gray-900">
                {ts.productionSectionUv}
              </h3>
              <div className="mt-4">
                <label className="block text-xs text-gray-600">
                  {ac.productionInkMlPerSqmUv}
                  <Input
                    className="mt-1"
                    inputMode="decimal"
                    value={String(production.inkMlPerSqmUvRigid)}
                    onChange={(ev) => {
                      const n = Number.parseFloat(ev.target.value.replace(",", "."));
                      setProduction((p) => ({
                        ...p,
                        inkMlPerSqmUvRigid: Number.isFinite(n) && n >= 0 ? n : 0,
                      }));
                    }}
                  />
                </label>
              </div>
            </div>

            <div className={cardClass}>
              <h3 className="text-sm font-semibold text-gray-900">
                {ts.productionSectionDtf}
              </h3>
              <div className="mt-4">
                <label className="block text-xs text-gray-600">
                  {ac.productionInkMlPerSqmDtf}
                  <Input
                    className="mt-1"
                    inputMode="decimal"
                    value={String(production.inkMlPerSqmDtfTextile)}
                    onChange={(ev) => {
                      const n = Number.parseFloat(ev.target.value.replace(",", "."));
                      setProduction((p) => ({
                        ...p,
                        inkMlPerSqmDtfTextile: Number.isFinite(n) && n >= 0 ? n : 0,
                      }));
                    }}
                  />
                </label>
              </div>
            </div>
          </div>

          {saveUi === "standalone" ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" size="sm" onClick={() => void persistProduction()}>
                {productionStatus === "saving" ? ac.savingProduction : ac.saveProduction}
              </Button>
              {productionStatus === "saved" ? (
                <span className="text-xs text-emerald-700">{ac.savedProduction}</span>
              ) : null}
              {productionStatus === "error" ? (
                <span className="text-xs text-red-700">{ac.saveProductionFailed}</span>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
});
