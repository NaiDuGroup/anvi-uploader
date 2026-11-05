"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminConfirmDialog } from "@/app/admin/_components/AdminConfirmDialog";
import { DatePicker } from "@/app/admin/_components/DatePicker";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { cn } from "@/lib/utils";
import { promoAdminState, type PromoAdminRow, type PromoAdminState } from "@/lib/shop/promo/promoAdmin";
import type { PromoType } from "@/lib/shop/promo/promoCore";
import { dayKeyOf } from "@/lib/shop/report/period";

interface Options {
  categories: { slug: string; ru: string; ro: string; en: string }[];
  products: { slug: string; name: string; category: string }[];
}

interface FormState {
  id: string | null;
  code: string;
  type: PromoType;
  value: string;
  minOrderMdl: string;
  validFrom: string;
  validTo: string;
  maxUsesTotal: string;
  maxUsesPerCustomer: string;
  categories: string[];
  products: string[];
  active: boolean;
  note: string;
}

const EMPTY_FORM: FormState = {
  id: null,
  code: "",
  type: "percent",
  value: "10",
  minOrderMdl: "",
  validFrom: "",
  validTo: "",
  maxUsesTotal: "",
  maxUsesPerCustomer: "1",
  categories: [],
  products: [],
  active: true,
  note: "",
};

function toForm(r: PromoAdminRow): FormState {
  return {
    id: r.id,
    code: r.code,
    type: (r.type as PromoType) ?? "percent",
    value: String(r.value),
    minOrderMdl: r.minOrderMdl != null ? String(r.minOrderMdl) : "",
    validFrom: r.validFrom ?? "",
    validTo: r.validTo ?? "",
    maxUsesTotal: r.maxUsesTotal != null ? String(r.maxUsesTotal) : "",
    maxUsesPerCustomer: r.maxUsesPerCustomer != null ? String(r.maxUsesPerCustomer) : "",
    categories: r.categories,
    products: r.products,
    active: r.active,
    note: r.note ?? "",
  };
}

function numOrNull(s: string): number | null {
  const v = s.trim().replace(",", ".");
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const STATE_CLS: Record<PromoAdminState, string> = {
  active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  scheduled: "bg-sky-50 text-sky-700 ring-sky-200",
  expired: "bg-gray-100 text-gray-500 ring-gray-200",
  used_up: "bg-amber-50 text-amber-800 ring-amber-200",
  off: "bg-gray-100 text-gray-500 ring-gray-200",
};

export default function ShopPromoPageClient() {
  const { t, locale } = useLanguageStore();
  const p = t.shopPromo;
  const [codes, setCodes] = useState<PromoAdminRow[] | null>(null);
  const [options, setOptions] = useState<Options>({ categories: [], products: [] });
  const [loadError, setLoadError] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<PromoAdminRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [productQuery, setProductQuery] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/shop/promo-codes", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { codes: PromoAdminRow[]; options: Options };
      setCodes(body.codes);
      setOptions(body.options);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const today = dayKeyOf(new Date());
  const catName = useCallback(
    (slug: string) => {
      const c = options.categories.find((x) => x.slug === slug);
      return c ? (locale === "ro" ? c.ro : locale === "en" ? c.en : c.ru) : slug;
    },
    [options.categories, locale],
  );
  const productName = useCallback(
    (slug: string) => options.products.find((x) => x.slug === slug)?.name ?? slug,
    [options.products],
  );

  const stateLabel: Record<PromoAdminState, string> = {
    active: p.stateActive,
    scheduled: p.stateScheduled,
    expired: p.stateExpired,
    used_up: p.stateUsedUp,
    off: p.stateOff,
  };

  const discountText = (r: Pick<PromoAdminRow, "type" | "value">): string =>
    r.type === "percent" ? `−${r.value}%` : r.type === "fixed" ? `−${r.value} MDL` : p.typeFreeDelivery;

  const toggleActive = async (r: PromoAdminRow) => {
    setCodes((cs) => cs?.map((c) => (c.id === r.id ? { ...c, active: !r.active } : c)) ?? cs);
    const res = await fetch(`/api/admin/shop/promo-codes/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !r.active }),
    }).catch(() => null);
    if (!res?.ok) void load();
  };

  const save = async () => {
    if (!form) return;
    setFormError(null);
    setSaving(true);
    const payload = {
      code: form.code,
      type: form.type,
      value: form.type === "free_delivery" ? 0 : (numOrNull(form.value) ?? 0),
      minOrderMdl: numOrNull(form.minOrderMdl),
      validFrom: form.validFrom || null,
      validTo: form.validTo || null,
      maxUsesTotal: numOrNull(form.maxUsesTotal),
      maxUsesPerCustomer: numOrNull(form.maxUsesPerCustomer),
      categories: form.categories,
      products: form.products,
      active: form.active,
      note: form.note,
    };
    try {
      const res = await fetch(form.id ? `/api/admin/shop/promo-codes/${form.id}` : "/api/admin/shop/promo-codes", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setForm(null);
        await load();
      } else {
        const body = (await res.json().catch(() => null)) as { error?: string; issues?: { message: string }[] } | null;
        const msg = body?.issues?.[0]?.message;
        setFormError(
          body?.error === "code_taken"
            ? p.errTaken
            : msg === "invalid_code"
              ? p.errCode
              : msg === "invalid_percent"
                ? p.errPercent
                : msg === "invalid_value"
                  ? p.errValue
                  : msg === "invalid_period"
                    ? p.errPeriod
                    : p.errSave,
        );
      }
    } catch {
      setFormError(p.errSave);
    }
    setSaving(false);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    await fetch(`/api/admin/shop/promo-codes/${deleting.id}`, { method: "DELETE" }).catch(() => null);
    setDeleteBusy(false);
    setDeleting(null);
    await load();
  };

  const filteredProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    const list = q
      ? options.products.filter((x) => x.name.toLowerCase().includes(q) || x.slug.includes(q))
      : options.products;
    return list.slice(0, 60);
  }, [options.products, productQuery]);

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-gray-900">{p.title}</h2>
          <p className="mt-1 max-w-3xl text-sm text-gray-500">{p.intro}</p>
        </div>
        <Button
          onClick={() => {
            setFormError(null);
            setForm({ ...EMPTY_FORM });
          }}
        >
          <Plus className="h-4 w-4" />
          {p.newCode}
        </Button>
      </div>

      {loadError ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{p.loadError}</p>
      ) : codes == null ? (
        <p className="text-sm text-gray-500">{p.loading}</p>
      ) : codes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-500">{p.empty}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2.5">{p.colCode}</th>
                <th className="px-3 py-2.5">{p.colDiscount}</th>
                <th className="px-3 py-2.5">{p.colMin}</th>
                <th className="px-3 py-2.5">{p.colValidity}</th>
                <th className="px-3 py-2.5">{p.colUses}</th>
                <th className="px-3 py-2.5">{p.colLimits}</th>
                <th className="px-3 py-2.5">{p.colState}</th>
                <th className="px-3 py-2.5">{p.colActive}</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {codes.map((r) => {
                const st = promoAdminState(r, today);
                const scope = [...r.categories.map(catName), ...r.products.map(productName)];
                return (
                  <tr key={r.id} className="align-top">
                    <td className="px-3 py-2.5">
                      <span className="font-mono font-semibold text-gray-900">{r.code}</span>
                      {r.note ? <p className="mt-0.5 max-w-[16rem] text-xs text-gray-500">{r.note}</p> : null}
                    </td>
                    <td className="px-3 py-2.5 font-medium">{discountText(r)}</td>
                    <td className="px-3 py-2.5">{r.minOrderMdl != null ? `${r.minOrderMdl} MDL` : "—"}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-gray-700">
                      {r.validFrom || r.validTo ? `${r.validFrom ?? "…"} — ${r.validTo ?? "…"}` : p.always}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-semibold">{p.usesOf(r.usesCount, r.maxUsesTotal)}</span>
                      {r.pendingOrders > 0 ? (
                        <p className="text-xs text-gray-500">
                          +{r.pendingOrders} {p.pendingHint}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-600">
                      {r.maxUsesPerCustomer != null ? (
                        <p>
                          {r.maxUsesPerCustomer} {p.perCustomerShort}
                        </p>
                      ) : null}
                      <p>{scope.length ? scope.join(", ") : p.allProducts}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1", STATE_CLS[st])}>
                        {stateLabel[st]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-amber-600"
                        checked={r.active}
                        onChange={() => void toggleActive(r)}
                        aria-label={`${p.fieldActive}: ${r.code}`}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                          title={p.edit}
                          aria-label={`${p.edit}: ${r.code}`}
                          onClick={() => {
                            setFormError(null);
                            setForm(toForm(r));
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="rounded-md p-2 text-gray-500 hover:bg-red-50 hover:text-red-600"
                          title={p.delete}
                          aria-label={`${p.delete}: ${r.code}`}
                          onClick={() => setDeleting(r)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {form ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/40 p-4" role="dialog" aria-modal aria-labelledby="promo-form-title">
          <div className="my-auto w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 id="promo-form-title" className="text-lg font-bold text-gray-900">
                {form.id ? `${p.formTitleEdit} ${form.code}` : p.formTitleNew}
              </h3>
              <button type="button" onClick={() => setForm(null)} className="rounded-md p-2 text-gray-500 hover:bg-gray-100" aria-label={p.cancel}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                <span className="font-medium text-gray-700">{p.fieldCode}</span>
                <Input
                  value={form.code}
                  maxLength={40}
                  className="font-mono uppercase"
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                />
                <span className="text-xs text-gray-500">{p.fieldCodeHint}</span>
              </label>
              <fieldset className="flex flex-col gap-1 text-sm sm:col-span-2">
                <legend className="mb-1 font-medium text-gray-700">{p.fieldType}</legend>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["percent", p.typePercent],
                      ["fixed", p.typeFixed],
                      ["free_delivery", p.typeFreeDelivery],
                    ] as const
                  ).map(([id, label]) => (
                    <label
                      key={id}
                      className={cn(
                        "inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2",
                        form.type === id ? "border-amber-400 bg-amber-50" : "border-gray-200",
                      )}
                    >
                      <input type="radio" name="promo-type" checked={form.type === id} onChange={() => setForm({ ...form, type: id })} className="accent-amber-600" />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
              {form.type !== "free_delivery" ? (
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-gray-700">{form.type === "percent" ? p.fieldValuePercent : p.fieldValueFixed}</span>
                  <Input inputMode="decimal" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
                </label>
              ) : null}
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-gray-700">{p.fieldMin}</span>
                <Input inputMode="decimal" value={form.minOrderMdl} onChange={(e) => setForm({ ...form, minOrderMdl: e.target.value })} />
                <span className="text-xs text-gray-500">{p.fieldMinHint}</span>
              </label>
              <div className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-gray-700">{p.fieldFrom}</span>
                <DatePicker value={form.validFrom} onChange={(v) => setForm({ ...form, validFrom: v })} locale={locale} t={t} ariaLabel={p.fieldFrom} />
              </div>
              <div className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-gray-700">{p.fieldTo}</span>
                <DatePicker value={form.validTo} onChange={(v) => setForm({ ...form, validTo: v })} locale={locale} t={t} ariaLabel={p.fieldTo} />
              </div>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-gray-700">{p.fieldMaxTotal}</span>
                <Input inputMode="numeric" value={form.maxUsesTotal} onChange={(e) => setForm({ ...form, maxUsesTotal: e.target.value.replace(/\D/g, "") })} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-gray-700">{p.fieldMaxCustomer}</span>
                <Input
                  inputMode="numeric"
                  value={form.maxUsesPerCustomer}
                  onChange={(e) => setForm({ ...form, maxUsesPerCustomer: e.target.value.replace(/\D/g, "") })}
                />
              </label>
              <p className="-mt-2 text-xs text-gray-500 sm:col-span-2">{p.fieldLimitHint}</p>
              <fieldset className="flex flex-col gap-1 text-sm sm:col-span-2">
                <legend className="mb-1 font-medium text-gray-700">{p.fieldCategories}</legend>
                <div className="flex flex-wrap gap-1.5">
                  {options.categories.map((c) => {
                    const on = form.categories.includes(c.slug);
                    return (
                      <button
                        key={c.slug}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          setForm({ ...form, categories: on ? form.categories.filter((x) => x !== c.slug) : [...form.categories, c.slug] })
                        }
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-xs",
                          on ? "border-amber-400 bg-amber-50 font-semibold text-amber-900" : "border-gray-200 text-gray-600 hover:bg-gray-50",
                        )}
                      >
                        {catName(c.slug)}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <fieldset className="flex flex-col gap-1.5 text-sm sm:col-span-2">
                <legend className="mb-1 font-medium text-gray-700">{p.fieldProducts}</legend>
                {form.products.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {form.products.map((slug) => (
                      <span key={slug} className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900 ring-1 ring-amber-200">
                        {productName(slug)}
                        <button
                          type="button"
                          aria-label={`${p.delete}: ${productName(slug)}`}
                          onClick={() => setForm({ ...form, products: form.products.filter((x) => x !== slug) })}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}
                <Input placeholder={p.productsSearch} value={productQuery} onChange={(e) => setProductQuery(e.target.value)} />
                <div className="max-h-40 overflow-y-auto rounded-md border border-gray-100">
                  {filteredProducts
                    .filter((x) => !form.products.includes(x.slug))
                    .map((x) => (
                      <button
                        key={x.slug}
                        type="button"
                        className="flex w-full justify-between gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-gray-50"
                        onClick={() => setForm({ ...form, products: [...form.products, x.slug] })}
                      >
                        <span>{x.name}</span>
                        <span className="text-gray-400">{catName(x.category)}</span>
                      </button>
                    ))}
                </div>
                <span className="text-xs text-gray-500">{p.fieldScopeHint}</span>
              </fieldset>
              <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                <span className="font-medium text-gray-700">{p.fieldNote}</span>
                <Input value={form.note} maxLength={500} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </label>
              <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
                <input type="checkbox" className="h-5 w-5 accent-amber-600" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                {p.fieldActive}
              </label>
            </div>
            {formError ? <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setForm(null)} disabled={saving}>
                {p.cancel}
              </Button>
              <Button onClick={() => void save()} disabled={saving}>
                {saving ? p.saving : p.save}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <AdminConfirmDialog
        open={deleting != null}
        title={p.deleteTitle}
        description={deleting && deleting.ordersCount > 0 ? p.deleteHasOrders : p.deleteText}
        confirmLabel={deleting && deleting.ordersCount > 0 ? p.cancel : p.delete}
        cancelLabel={p.cancel}
        confirmVariant={deleting && deleting.ordersCount > 0 ? "default" : "destructive"}
        busy={deleteBusy}
        onConfirm={() => (deleting && deleting.ordersCount > 0 ? setDeleting(null) : void confirmDelete())}
        onClose={() => setDeleting(null)}
      />
    </main>
  );
}
