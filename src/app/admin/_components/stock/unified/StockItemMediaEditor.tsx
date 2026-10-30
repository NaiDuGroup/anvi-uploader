"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguageStore } from "@/stores/useLanguageStore";
import type { StockItemJson } from "@/lib/stock/unified/adminTypes";
import type { StockItemDescription } from "@/lib/stock/unified/itemDescription";
import { stockFetch } from "./stockApi";
import { EMPTY_DESCRIPTION, StockItemMediaSection } from "./StockItemMediaSection";

/**
 * Photos and description of one stock item with its own «Сохранить» — for the
 * mug / notebook / pen catalog windows, which save their fields elsewhere.
 */
export function StockItemMediaEditor({ itemId }: { itemId: string }) {
  const t = useLanguageStore((s) => s.t);
  const [item, setItem] = useState<StockItemJson | null>(null);
  const [gallery, setGallery] = useState<string[]>([]);
  const [description, setDescription] = useState<StockItemDescription>(EMPTY_DESCRIPTION);
  const [saving, setSaving] = useState<boolean>(false);
  const [saved, setSaved] = useState<boolean>(false);
  const [error, setError] = useState<boolean>(false);

  const apply = (it: StockItemJson): void => {
    setItem(it);
    setGallery(it.galleryImages);
    setDescription(it.description ?? EMPTY_DESCRIPTION);
  };

  useEffect(() => {
    stockFetch<{ item: StockItemJson }>(`/api/admin/stock/items/${itemId}`)
      .then((r) => apply(r.item))
      .catch(() => setError(true));
  }, [itemId]);

  const save = async (): Promise<void> => {
    setSaving(true);
    setSaved(false);
    setError(false);
    try {
      const r = await stockFetch<{ item: StockItemJson }>(`/api/admin/stock/items/${itemId}`, {
        method: "PATCH",
        body: { galleryImages: gallery, description },
      });
      apply(r.item);
      setSaved(true);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  if (!item) {
    return error ? null : (
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" /> {t.common.loading}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <StockItemMediaSection
        item={item}
        gallery={gallery}
        onGalleryChange={(g) => {
          setGallery(g);
          setSaved(false);
        }}
        description={description}
        onDescriptionChange={(d) => {
          setDescription(d);
          setSaved(false);
        }}
        onSupplierSynced={apply}
        disabled={saving}
        t={t}
      />
      <div className="flex items-center justify-end gap-3">
        {saved && <span className="text-xs text-emerald-700">✓</span>}
        {error && <span className="text-xs text-red-600">{t.stock.media.pullFailed}</span>}
        <Button type="button" size="sm" variant="outline" onClick={() => void save()} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {t.stock.media.save}
        </Button>
      </div>
    </div>
  );
}
