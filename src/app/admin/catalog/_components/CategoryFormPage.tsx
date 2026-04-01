"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";
import type { AttributeField, AttributeSchema, PricingModel, Surcharge } from "@/lib/validations";
import AttributeSchemaEditor from "./AttributeSchemaEditor";

interface SurchargeRow {
  key: string;
  label: { ro: string; ru: string; en: string };
  pricePerUnit: string;
}

interface CategoryFormData {
  name: string;
  slug: string;
  description: string;
  icon: string;
  pricingModel: PricingModel;
  servicePriceDefault: string;
  dimensionsRequired: boolean;
  surcharges: SurchargeRow[];
  sortOrder: number;
  isActive: boolean;
  attributeSchema: AttributeSchema;
}

const emptyForm: CategoryFormData = {
  name: "",
  slug: "",
  description: "",
  icon: "",
  pricingModel: "fixed",
  servicePriceDefault: "",
  dimensionsRequired: false,
  surcharges: [],
  sortOrder: 0,
  isActive: true,
  attributeSchema: { fields: [] },
};

interface Props {
  categoryId?: string;
}

export default function CategoryFormPage({ categoryId }: Props) {
  const { t } = useLanguageStore();
  const router = useRouter();
  const isEdit = !!categoryId;

  const [form, setForm] = useState<CategoryFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(isEdit);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!categoryId) return;
    fetch(`/api/admin/categories`)
      .then((r) => r.json())
      .then((cats: Array<{ id: string; name: string; slug: string; description: string | null; icon: string | null; pricingModel: string; servicePriceDefault: number | null; dimensionsRequired: boolean; surcharges: Surcharge[] | null; sortOrder: number; isActive: boolean; attributeSchema: unknown }>) => {
        const cat = cats.find((c) => c.id === categoryId);
        if (!cat) {
          router.replace("/admin/catalog");
          return;
        }
        const schema = cat.attributeSchema as AttributeSchema;
        setForm({
          name: cat.name,
          slug: cat.slug,
          description: cat.description ?? "",
          icon: cat.icon ?? "",
          pricingModel: (cat.pricingModel as PricingModel) || "fixed",
          servicePriceDefault: cat.servicePriceDefault != null ? String(cat.servicePriceDefault) : "",
          dimensionsRequired: cat.dimensionsRequired ?? false,
          surcharges: (cat.surcharges ?? []).map((s) => ({
            key: s.key,
            label: s.label,
            pricePerUnit: String(s.pricePerUnit),
          })),
          sortOrder: cat.sortOrder,
          isActive: cat.isActive,
          attributeSchema: schema?.fields ? schema : { fields: [] },
        });
      })
      .catch(() => router.replace("/admin/catalog"))
      .finally(() => setLoadingData(false));
  }, [categoryId, router]);

  const handleSlugify = (name: string) => {
    if (!isEdit) {
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 100);
      setForm((f) => ({ ...f, name, slug }));
    } else {
      setForm((f) => ({ ...f, name }));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const url = isEdit
        ? `/api/admin/categories/${categoryId}`
        : "/api/admin/categories";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          slug: form.slug,
          description: form.description || undefined,
          icon: form.icon || undefined,
          pricingModel: form.pricingModel,
          servicePriceDefault: form.servicePriceDefault ? parseFloat(form.servicePriceDefault) : null,
          dimensionsRequired: form.dimensionsRequired,
          surcharges: form.surcharges.length > 0
            ? form.surcharges
                .filter((s) => s.key && s.pricePerUnit)
                .map((s) => ({
                  key: s.key,
                  label: s.label,
                  pricePerUnit: parseFloat(s.pricePerUnit) || 0,
                }))
            : null,
          sortOrder: form.sortOrder,
          isActive: form.isActive,
          attributeSchema: form.attributeSchema,
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

  const canSave = form.name.trim() && form.slug.trim();

  if (loadingData) {
    return (
      <>
        <div className="bg-white border-b sticky top-0 z-10">
          <div className="px-6 py-3 flex items-center gap-3">
            <button onClick={() => router.push("/admin/catalog")} className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-bold text-gray-900">{t.admin.catalogEditCategory}</h1>
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
            <h1 className="text-lg font-bold text-gray-900">
              {isEdit ? t.admin.catalogEditCategory : t.admin.catalogNewCategory}
            </h1>
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.admin.catalogName} *</label>
              <Input value={form.name} onChange={(e) => handleSlugify(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.admin.catalogSlug} *</label>
              <Input
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                className="font-mono text-sm"
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
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.admin.catalogIcon}</label>
              <Input
                value={form.icon}
                onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                placeholder="FileText"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.admin.catalogSortOrder}</label>
              <Input
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm((f) => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))}
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

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mt-6 space-y-5">
          <h3 className="text-sm font-semibold text-gray-900">{t.admin.pricingModel}</h3>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.admin.pricingModel}</label>
            <select
              value={form.pricingModel}
              onChange={(e) => {
                const pm = e.target.value as PricingModel;
                setForm((f) => ({
                  ...f,
                  pricingModel: pm,
                  dimensionsRequired: pm === "per_sqm" ? true : f.dimensionsRequired,
                }));
              }}
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-950"
            >
              <option value="fixed">{t.admin.pricingFixed}</option>
              <option value="per_sqm">{t.admin.pricingPerSqm}</option>
              <option value="per_unit">{t.admin.pricingPerUnit}</option>
            </select>
            <p className="text-xs text-gray-400 mt-1">
              {form.pricingModel === "fixed" && "Product has a fixed selling price per unit"}
              {form.pricingModel === "per_sqm" && "Price calculated by area (width × height)"}
              {form.pricingModel === "per_unit" && "Product price + service price per unit"}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.admin.servicePrice}</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.servicePriceDefault}
                onChange={(e) => setForm((f) => ({ ...f, servicePriceDefault: e.target.value }))}
                placeholder="0.00"
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.dimensionsRequired}
                  onChange={(e) => setForm((f) => ({ ...f, dimensionsRequired: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 accent-amber-500"
                />
                <span className="text-sm font-medium text-gray-700">{t.admin.dimensionsRequired}</span>
              </label>
            </div>
          </div>
        </div>

        {/* Surcharges */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">{t.admin.surchargesLabel}</h3>
            <button
              type="button"
              onClick={() => setForm((f) => ({
                ...f,
                surcharges: [...f.surcharges, { key: "", label: { ro: "", ru: "", en: "" }, pricePerUnit: "" }],
              }))}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              <Plus className="w-3 h-3" />
              {t.admin.addSurcharge}
            </button>
          </div>

          {form.surcharges.length === 0 ? (
            <p className="text-xs text-gray-400">No surcharges configured.</p>
          ) : (
            <div className="space-y-3">
              {form.surcharges.map((sc, idx) => (
                <div key={idx} className="border border-gray-100 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="grid grid-cols-2 gap-2 flex-1 mr-2">
                      <Input
                        value={sc.key}
                        onChange={(e) => {
                          const next = [...form.surcharges];
                          next[idx] = { ...next[idx], key: e.target.value };
                          setForm((f) => ({ ...f, surcharges: next }));
                        }}
                        placeholder="rounded-corners"
                        className="text-sm font-mono"
                      />
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={sc.pricePerUnit}
                        onChange={(e) => {
                          const next = [...form.surcharges];
                          next[idx] = { ...next[idx], pricePerUnit: e.target.value };
                          setForm((f) => ({ ...f, surcharges: next }));
                        }}
                        placeholder="0.50"
                        className="text-sm"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({
                        ...f,
                        surcharges: f.surcharges.filter((_, i) => i !== idx),
                      }))}
                      className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      value={sc.label.ro}
                      onChange={(e) => {
                        const next = [...form.surcharges];
                        next[idx] = { ...next[idx], label: { ...next[idx].label, ro: e.target.value } };
                        setForm((f) => ({ ...f, surcharges: next }));
                      }}
                      placeholder="RO: Colțuri rotunde"
                      className="text-xs"
                    />
                    <Input
                      value={sc.label.ru}
                      onChange={(e) => {
                        const next = [...form.surcharges];
                        next[idx] = { ...next[idx], label: { ...next[idx].label, ru: e.target.value } };
                        setForm((f) => ({ ...f, surcharges: next }));
                      }}
                      placeholder="RU: Закруглённые углы"
                      className="text-xs"
                    />
                    <Input
                      value={sc.label.en}
                      onChange={(e) => {
                        const next = [...form.surcharges];
                        next[idx] = { ...next[idx], label: { ...next[idx].label, en: e.target.value } };
                        setForm((f) => ({ ...f, surcharges: next }));
                      }}
                      placeholder="EN: Rounded corners"
                      className="text-xs"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mt-6">
          <AttributeSchemaEditor
            fields={form.attributeSchema.fields}
            onChange={(fields: AttributeField[]) => setForm((f) => ({ ...f, attributeSchema: { fields } }))}
            t={t}
          />
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
