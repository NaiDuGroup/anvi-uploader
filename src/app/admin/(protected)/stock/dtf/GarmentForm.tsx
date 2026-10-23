"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GARMENT_KINDS, STANDARD_GARMENT_SIZES, type GarmentKind } from "@/lib/dtf/dtfConstants";
import type { GarmentProductJson } from "@/lib/dtf/dtfDto";
import { defaultPriceTiers, type GarmentPriceTier } from "@/lib/dtf/garmentPriceTiers";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { DTF_API, dtfErrorText, dtfRequest, parseDecimal } from "@/lib/dtf/dtfClientApi";

type TierDraft = { minQty: string; priceMdl: string };

const NO_SIZE_KINDS: ReadonlySet<GarmentKind> = new Set<GarmentKind>(["cap", "socks"]);

function toTierDrafts(tiers: readonly GarmentPriceTier[]): TierDraft[] {
  return tiers.map((tier) => ({ minQty: String(tier.minQty), priceMdl: String(tier.priceMdl) }));
}

function defaultSizes(kind: GarmentKind): string {
  return NO_SIZE_KINDS.has(kind) ? "ONE" : STANDARD_GARMENT_SIZES.join(", ");
}

function parseTiers(drafts: readonly TierDraft[]): GarmentPriceTier[] | null {
  const tiers: GarmentPriceTier[] = [];
  for (const d of drafts) {
    const minQty: number | null = parseDecimal(d.minQty);
    const priceMdl: number | null = parseDecimal(d.priceMdl);
    if (minQty == null || priceMdl == null || !Number.isInteger(minQty) || minQty < 1 || priceMdl < 0) {
      return null;
    }
    tiers.push({ minQty, priceMdl });
  }
  const unique: boolean = new Set(tiers.map((tier) => tier.minQty)).size === tiers.length;
  return unique && tiers.some((tier) => tier.minQty === 1) ? tiers : null;
}

export interface GarmentFormProps {
  /** Edit mode when set; create mode otherwise. */
  garment: GarmentProductJson | null;
  onSaved: () => void;
  onCancel: () => void;
}

export default function GarmentForm({ garment, onSaved, onCancel }: GarmentFormProps) {
  const { t } = useLanguageStore();
  const g = t.dtf.garments;
  const initialKind: GarmentKind = garment?.kind ?? "tshirt";

  const [kind, setKind] = useState<GarmentKind>(initialKind);
  const [name, setName] = useState<string>(garment?.name ?? "");
  const [colorName, setColorName] = useState<string>(garment?.colorName ?? "");
  const [colorHex, setColorHex] = useState<string>(garment?.colorHex ?? "#ffffff");
  const [isWhite, setIsWhite] = useState<boolean>(true);
  const [sizesText, setSizesText] = useState<string>(
    garment ? garment.variants.map((v) => v.size).join(", ") : defaultSizes(initialKind),
  );
  const [purchaseCost, setPurchaseCost] = useState<string>(
    garment?.purchaseCost == null ? "" : String(garment.purchaseCost),
  );
  const [tiers, setTiers] = useState<TierDraft[]>(
    toTierDrafts(garment?.priceTiers.length ? garment.priceTiers : defaultPriceTiers(initialKind, true)),
  );
  const [notes, setNotes] = useState<string>(garment?.internalNotes ?? "");
  const [isActive, setIsActive] = useState<boolean>(garment?.isActive ?? true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  function changeKind(next: GarmentKind): void {
    setKind(next);
    if (!garment) {
      setSizesText(defaultSizes(next));
      setTiers(toTierDrafts(defaultPriceTiers(next, isWhite)));
    }
  }

  function updateTier(index: number, patch: Partial<TierDraft>): void {
    setTiers((prev) => prev.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)));
  }

  async function submit(): Promise<void> {
    setError(null);
    const sizes: string[] = sizesText
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const parsedTiers: GarmentPriceTier[] | null = parseTiers(tiers);
    const cost: number | null = parseDecimal(purchaseCost);
    if (!name.trim() || !colorName.trim() || sizes.length === 0 || parsedTiers == null) {
      setError(g.priceTiersHint);
      return;
    }
    const body = {
      kind,
      name: name.trim(),
      colorName: colorName.trim(),
      colorHex,
      purchaseCost: cost,
      priceTiers: parsedTiers,
      sizes,
      internalNotes: notes.trim() || null,
      ...(garment ? { isActive } : {}),
    };
    setSaving(true);
    try {
      if (garment) await dtfRequest(DTF_API.garment(garment.id), "PATCH", body);
      else await dtfRequest(DTF_API.garments, "POST", body);
      onSaved();
    } catch (e) {
      setError(dtfErrorText(e, t));
    } finally {
      setSaving(false);
    }
  }

  const labelClass = "mb-1 block text-xs font-medium text-gray-600";

  return (
    <div className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50/40 p-4 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className={labelClass}>{g.kind}</span>
          <select
            className="h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-sm"
            value={kind}
            onChange={(e) => changeKind(e.target.value as GarmentKind)}
          >
            {GARMENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {t.dtf.garmentKinds[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelClass}>{g.name}</span>
          <Input value={name} placeholder={g.namePlaceholder} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block">
          <span className={labelClass}>{g.color}</span>
          <div className="flex gap-2">
            <input
              type="color"
              aria-label={g.colorHex}
              className="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-gray-200 bg-white p-0.5"
              value={colorHex}
              onChange={(e) => setColorHex(e.target.value)}
            />
            <Input
              value={colorName}
              placeholder={g.colorPlaceholder}
              onChange={(e) => setColorName(e.target.value)}
            />
          </div>
        </label>
        <label className="block">
          <span className={labelClass}>{g.purchaseCost}</span>
          <Input inputMode="decimal" value={purchaseCost} onChange={(e) => setPurchaseCost(e.target.value)} />
          <span className="mt-1 block text-[11px] text-gray-500">{g.purchaseCostHint}</span>
        </label>
      </div>

      <label className="mt-3 block">
        <span className={labelClass}>{g.sizes}</span>
        <Input value={sizesText} onChange={(e) => setSizesText(e.target.value)} />
        <span className="mt-1 block text-[11px] text-gray-500">{g.sizesHint}</span>
      </label>

      <div className="mt-4">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium text-gray-600">{g.priceTiers}</span>
          <div className="flex items-center gap-3 text-xs">
            <label className="flex items-center gap-1.5 text-gray-600">
              <input type="checkbox" checked={isWhite} onChange={(e) => setIsWhite(e.target.checked)} />
              {g.isWhite}
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setTiers(toTierDrafts(defaultPriceTiers(kind, isWhite)))}
            >
              {g.applyDefaultTiers}
            </Button>
          </div>
        </div>
        <p className="mb-2 text-[11px] text-gray-500">{g.priceTiersHint}</p>
        <div className="flex flex-wrap gap-2">
          {tiers.map((tier, i) => (
            <div key={i} className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1.5">
              <Input
                className="h-8 w-16"
                inputMode="numeric"
                aria-label={g.tierFrom}
                value={tier.minQty}
                onChange={(e) => updateTier(i, { minQty: e.target.value })}
              />
              <span className="text-xs text-gray-400">→</span>
              <Input
                className="h-8 w-20"
                inputMode="decimal"
                aria-label={g.tierPrice}
                value={tier.priceMdl}
                onChange={(e) => updateTier(i, { priceMdl: e.target.value })}
              />
              <button
                type="button"
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                aria-label={t.dtf.pricing.deletePreset}
                onClick={() => setTiers((prev) => prev.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setTiers((prev) => [...prev, { minQty: "", priceMdl: "" }])}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            {g.addTier}
          </Button>
        </div>
      </div>

      <label className="mt-3 block">
        <span className={labelClass}>{g.notes}</span>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      {garment && (
        <label className="mt-3 flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          {g.active}
        </label>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex gap-2">
        <Button type="button" disabled={saving} onClick={() => void submit()}>
          {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          {saving ? t.dtf.stock.saving : t.dtf.stock.save}
        </Button>
        <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>
          {t.dtf.stock.cancel}
        </Button>
      </div>
    </div>
  );
}
