"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";
import type { PriceTier } from "@/lib/validations";

interface CategoryOption {
  id: string;
  name: string;
}

interface TierRow {
  minQty: string;
  maxQty: string;
  price: string;
  totalFixed: string;
}

interface ProductFormData {
  categoryId: string;
  name: string;
  sku: string;
  description: string;
  costPrice: string;
  sellingPrice: string;
  priceTiers: TierRow[];
  minQuantity: string;
  leadTimeDays: string;
  isActive: boolean;
}

const emptyForm: ProductFormData = {
  categoryId: "",
  name: "",
  sku: "",
  description: "",
  costPrice: "",
  sellingPrice: "",
  priceTiers: [],
  minQuantity: "",
  leadTimeDays: "",
  isActive: true,
};

interface Props {
  productId?: string;
}

export default function ProductFormPage({ productId }: Props) {
  const { t } = useLanguageStore();
  const router = useRouter();
  const isEdit = !!productId;

  const [form, setForm] = useState<ProductFormData>(emptyForm);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadData = async () => {
      try {
        const catsRes = await fetch("/api/admin/categories");
        const cats = await catsRes.json() as Array<{ id: string; name: string }>;
        setCategories(cats.map((c) => ({ id: c.id, name: c.name })));

        if (productId) {
          const prodsRes = await fetch("/api/admin/products");
          const prods = await prodsRes.json() as Array<{ id: string; categoryId: string; name: string; sku: string; description: string | null; costPrice: number | null; sellingPrice: number | null; priceTiers: PriceTier[] | null; minQuantity: number | null; leadTimeDays: string | null; isActive: boolean }>;
          const prod = prods.find((p) => p.id === productId);
          if (!prod) {
            router.replace("/admin/catalog");
            return;
          }
          setForm({
            categoryId: prod.categoryId,
            name: prod.name,
            sku: prod.sku,
            description: prod.description ?? "",
            costPrice: prod.costPrice != null ? String(prod.costPrice) : "",
            sellingPrice: prod.sellingPrice != null ? String(prod.sellingPrice) : "",
            priceTiers: (prod.priceTiers ?? []).map((t) => ({
              minQty: String(t.minQty),
              maxQty: t.maxQty != null ? String(t.maxQty) : "",
              price: String(t.price),
              totalFixed: t.totalFixed != null ? String(t.totalFixed) : "",
            })),
            minQuantity: prod.minQuantity != null ? String(prod.minQuantity) : "",
            leadTimeDays: prod.leadTimeDays ?? "",
            isActive: prod.isActive,
          });
        }
      } catch {
        router.replace("/admin/catalog");
      } finally {
        setLoadingData(false);
      }
    };
    loadData();
  }, [productId, router]);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const url = isEdit
        ? `/api/admin/products/${productId}`
        : "/api/admin/products";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: form.categoryId,
          name: form.name,
          sku: form.sku,
          description: form.description || undefined,
          costPrice: form.costPrice ? parseFloat(form.costPrice) : null,
          sellingPrice: form.sellingPrice ? parseFloat(form.sellingPrice) : null,
          priceTiers: form.priceTiers.length > 0
            ? form.priceTiers
                .filter((t) => t.minQty && t.price)
                .map((t) => ({
                  minQty: parseInt(t.minQty) || 1,
                  maxQty: t.maxQty ? parseInt(t.maxQty) : null,
                  price: parseFloat(t.price) || 0,
                  totalFixed: t.totalFixed ? parseFloat(t.totalFixed) : null,
                }))
            : null,
          minQuantity: form.minQuantity ? parseInt(form.minQuantity) : null,
          leadTimeDays: form.leadTimeDays || null,
          isActive: form.isActive,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to save");
      }
      router.push("/admin/catalog");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const canSave = form.name.trim() && form.sku.trim() && form.categoryId;
  const pageTitle = isEdit ? t.admin.catalogEditProduct : t.admin.catalogNewProduct;

  if (loadingData) {
    return (
      <>
        <div className="bg-white border-b sticky top-0 z-10">
          <div className="px-6 py-3 flex items-center gap-3">
            <button onClick={() => router.push("/admin/catalog")} className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-bold text-gray-900">{pageTitle}</h1>
          </div>
        </div>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/admin/catalog")} className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-bold text-gray-900">{pageTitle}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push("/admin/catalog")}>
              {t.admin.cancel}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !canSave}>
              {saving ? t.admin.saving : t.admin.save}
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.admin.catalogSelectCategory} *</label>
            <select
              value={form.categoryId}
              onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-950"
            >
              <option value="">{t.admin.catalogSelectCategory}</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.admin.catalogName} *</label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.admin.catalogSku} *</label>
              <Input
                value={form.sku}
                onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value.toUpperCase() }))}
                placeholder="MUG-W-330"
                className="font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.admin.catalogDescription}</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              className="flex w-full rounded-md border border-gray-200 bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.admin.costPrice}</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.costPrice}
                onChange={(e) => setForm((f) => ({ ...f, costPrice: e.target.value }))}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.admin.sellingPrice}</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.sellingPrice}
                onChange={(e) => setForm((f) => ({ ...f, sellingPrice: e.target.value }))}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.admin.minQuantity}</label>
              <Input
                type="number"
                min="1"
                value={form.minQuantity}
                onChange={(e) => setForm((f) => ({ ...f, minQuantity: e.target.value }))}
                placeholder="1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.admin.leadTimeDays}</label>
              <Input
                value={form.leadTimeDays}
                onChange={(e) => setForm((f) => ({ ...f, leadTimeDays: e.target.value }))}
                placeholder="1-3 zile"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 accent-amber-500"
            />
            <span className="text-sm font-medium text-gray-700">{t.admin.catalogActive}</span>
          </label>
        </div>

        {/* Price Tiers */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">{t.admin.priceTiers}</h3>
            <button
              type="button"
              onClick={() => setForm((f) => ({
                ...f,
                priceTiers: [...f.priceTiers, { minQty: "", maxQty: "", price: "", totalFixed: "" }],
              }))}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              <Plus className="w-3 h-3" />
              {t.admin.addTier}
            </button>
          </div>

          {form.priceTiers.length === 0 ? (
            <p className="text-xs text-gray-400">No price tiers — base sellingPrice will be used.</p>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 text-[10px] font-medium text-gray-500 uppercase tracking-wider px-1">
                <span>{t.admin.tierMinQty}</span>
                <span>{t.admin.tierMaxQty}</span>
                <span>{t.admin.tierPrice}</span>
                <span>{t.admin.tierTotalFixed}</span>
                <span className="w-7" />
              </div>
              {form.priceTiers.map((tier, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 items-center">
                  <Input
                    type="number"
                    min="1"
                    value={tier.minQty}
                    onChange={(e) => {
                      const next = [...form.priceTiers];
                      next[idx] = { ...next[idx], minQty: e.target.value };
                      setForm((f) => ({ ...f, priceTiers: next }));
                    }}
                    placeholder="1"
                    className="text-sm"
                  />
                  <Input
                    type="number"
                    min="1"
                    value={tier.maxQty}
                    onChange={(e) => {
                      const next = [...form.priceTiers];
                      next[idx] = { ...next[idx], maxQty: e.target.value };
                      setForm((f) => ({ ...f, priceTiers: next }));
                    }}
                    placeholder="∞"
                    className="text-sm"
                  />
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={tier.price}
                    onChange={(e) => {
                      const next = [...form.priceTiers];
                      next[idx] = { ...next[idx], price: e.target.value };
                      setForm((f) => ({ ...f, priceTiers: next }));
                    }}
                    placeholder="0.00"
                    className="text-sm"
                  />
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={tier.totalFixed}
                    onChange={(e) => {
                      const next = [...form.priceTiers];
                      next[idx] = { ...next[idx], totalFixed: e.target.value };
                      setForm((f) => ({ ...f, priceTiers: next }));
                    }}
                    placeholder="—"
                    className="text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({
                      ...f,
                      priceTiers: f.priceTiers.filter((_, i) => i !== idx),
                    }))}
                    className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-400">
            Price/unit — per-unit price. Fixed total — flat price for the whole tier (overrides per-unit).
          </p>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3 mt-6">
          <Button onClick={handleSave} disabled={saving || !canSave}>
            {saving ? t.admin.saving : t.admin.save}
          </Button>
          <Button variant="outline" onClick={() => router.push("/admin/catalog")}>
            {t.admin.cancel}
          </Button>
        </div>
      </div>
    </>
  );
}
