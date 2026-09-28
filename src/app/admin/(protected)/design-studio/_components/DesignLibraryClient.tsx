"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Copy,
  Loader2,
  Plus,
  Search,
  ShoppingCart,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CatalogOptionThumb } from "@/components/ui/CatalogOptionThumb";
import { MenuSelect, type MenuSelectOption } from "@/components/ui/MenuSelect";
import { NavLinkButton } from "@/components/ui/NavLinkButton";
import { AdminConfirmDialog } from "@/app/admin/_components/AdminConfirmDialog";
import { adminTableOutlineIconButtonClass } from "@/app/admin/_components/AdminTableIconActions";
import { resolveDesignFileUrl } from "@/lib/design/fileUrls";
import type { DesignListItemJson } from "@/lib/design/designJson";
import type { DesignTargetType } from "@/lib/design/doc";
import type { MugProductOption } from "@/app/mug/_components/MugProductPicker";
import type { NotebookProductOption } from "@/app/notebook/_components/NotebookProductPicker";
import { mugProductDisplayName } from "@/lib/mug/mugProductLabels";
import { notebookProductDisplayName } from "@/lib/notebook/notebookProductLabels";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { cn } from "@/lib/utils";

/** Catalog photo, or a color swatch when the SKU has no image yet. */
function catalogThumb(imageUrl: string | null, fallbackColor: string): ReactNode {
  return (
    <span
      className="flex size-10 shrink-0 overflow-hidden rounded-md border border-gray-200 bg-gray-50"
      style={imageUrl ? undefined : { backgroundColor: fallbackColor }}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- catalog CDN URLs
        <img src={imageUrl} alt="" className="size-full object-contain" />
      ) : null}
    </span>
  );
}

const ACTIVE_CHIP =
  "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-50 hover:text-amber-800";

export default function DesignLibraryClient() {
  const router = useRouter();
  const { t } = useLanguageStore();
  const ds = t.admin.designStudio;
  const [items, setItems] = useState<DesignListItemJson[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  /** Ids queued for deletion; non-empty opens the confirm dialog. */
  const [deleteIds, setDeleteIds] = useState<string[]>([]);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (tag) params.set("tag", tag);
    void fetch(`/api/admin/designs?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : { items: [], tags: [] }))
      .then((data: { items: DesignListItemJson[]; tags: string[] }) => {
        setItems(data.items ?? []);
        setTags(data.tags ?? []);
      })
      .finally(() => setLoading(false));
  }, [query, tag]);

  useEffect(() => {
    const timer = window.setTimeout(reload, 200);
    return () => window.clearTimeout(timer);
  }, [reload]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sendToOrder = (item: DesignListItemJson) => {
    if (item.renderKey) {
      router.push(`/admin/orders/new?designs=${encodeURIComponent(item.id)}`);
      return;
    }
    router.push(`/admin/design-studio/${item.id}?toOrder=1`);
  };

  const sendSelectedToOrder = () => {
    const selectedItems = items.filter((d) => selected.has(d.id));
    const withRender = selectedItems.filter((d) => d.renderKey).map((d) => d.id);
    const without = selectedItems.filter((d) => !d.renderKey);
    if (withRender.length > 0) {
      router.push(`/admin/orders/new?designs=${withRender.join(",")}`);
      return;
    }
    if (without.length === 1) {
      router.push(`/admin/design-studio/${without[0].id}?toOrder=1`);
    }
  };

  const duplicateOne = async (id: string) => {
    const res = await fetch(`/api/admin/designs/${id}/duplicate`, { method: "POST" });
    if (!res.ok) return;
    const data = (await res.json()) as { item: { id: string } };
    router.push(`/admin/design-studio/${data.item.id}`);
  };

  const deleteQueued = async () => {
    setDeleteBusy(true);
    try {
      await Promise.all(
        deleteIds.map((id) => fetch(`/api/admin/designs/${id}`, { method: "DELETE" })),
      );
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of deleteIds) next.delete(id);
        return next;
      });
      setDeleteIds([]);
      reload();
    } finally {
      setDeleteBusy(false);
    }
  };

  const tagOptions = [{ value: "", label: ds.allTags }, ...tags.map((value) => ({ value, label: value }))];

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-5">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">{ds.title}</h1>
          <p className="mt-1 text-sm text-gray-500">{ds.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <NavLinkButton href="/admin/design-studio/assets" variant="outline" leadingIcon={<Sparkles className="h-4 w-4" />}>
            {ds.clipartNav}
          </NavLinkButton>
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            {ds.newDesign}
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={ds.searchTitle}
            className="pl-8"
            aria-label={ds.searchTitle}
          />
        </div>
        {tags.length > 0 && (
          <MenuSelect
            value={tag}
            onChange={setTag}
            options={tagOptions}
            ariaLabel={ds.allTags}
            className="w-auto min-w-[10rem]"
          />
        )}
      </div>

      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
          <span className="font-medium text-amber-800">{ds.selectedCount(selected.size)}</span>
          <Button type="button" size="sm" onClick={sendSelectedToOrder}>
            <ShoppingCart className="h-3.5 w-3.5" aria-hidden />
            {ds.createOrder}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setDeleteIds([...selected])}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            {ds.delete}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" aria-hidden />
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
          {ds.emptyLibrary}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((item) => (
            <li key={item.id} className="group relative overflow-hidden rounded-lg border border-gray-200 bg-white">
              <label className="absolute top-2 left-2 z-10">
                <input
                  type="checkbox"
                  checked={selected.has(item.id)}
                  onChange={() => toggle(item.id)}
                  className="h-4 w-4"
                />
              </label>
              <Link href={`/admin/design-studio/${item.id}`} className="block">
                <div className="flex aspect-[3/4] items-center justify-center bg-gray-50">
                  {item.thumbKey ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={resolveDesignFileUrl(item.thumbKey)}
                      alt=""
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="text-xs text-gray-400">{ds.noPreview}</span>
                  )}
                </div>
                <div className="flex items-start gap-2 p-2.5">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate text-sm font-medium text-gray-900">{item.title}</p>
                    <p className="truncate text-[11px] text-gray-500">
                      {item.productSku ?? ds.sizeCm(item.widthCm, item.heightCm)}
                    </p>
                  </div>
                  {item.targetType === "mug" && (item.productImageUrl || item.productColorHex) ? (
                    <CatalogOptionThumb
                      variant="mug"
                      imagePublicUrl={item.productImageUrl}
                      bodyColorHex={item.productColorHex ?? "#f5f5f0"}
                    />
                  ) : null}
                  {item.targetType === "notebook" && (item.productImageUrl || item.productColorHex) ? (
                    <CatalogOptionThumb
                      variant="notebook"
                      imagePublicUrl={item.productImageUrl}
                      coverColorHex={item.productColorHex ?? "#1f1f1f"}
                    />
                  ) : null}
                </div>
              </Link>
              <div className="absolute top-2 right-2 z-10 hidden gap-1 group-hover:flex">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  title={ds.duplicate}
                  className={adminTableOutlineIconButtonClass}
                  onClick={() => void duplicateOne(item.id)}
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  title={ds.toOrder}
                  className={adminTableOutlineIconButtonClass}
                  onClick={() => sendToOrder(item)}
                >
                  <ShoppingCart className="h-3.5 w-3.5" aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  title={ds.delete}
                  className={adminTableOutlineIconButtonClass}
                  onClick={() => setDeleteIds([item.id])}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {createOpen && (
        <CreateDesignDialog
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => router.push(`/admin/design-studio/${id}`)}
        />
      )}

      <AdminConfirmDialog
        open={deleteIds.length > 0}
        title={ds.deleteDesignTitle}
        description={ds.deleteDesignDescription}
        confirmLabel={ds.delete}
        cancelLabel={ds.cancel}
        confirmVariant="destructive"
        busy={deleteBusy}
        onConfirm={() => void deleteQueued()}
        onClose={() => {
          if (!deleteBusy) setDeleteIds([]);
        }}
      />
    </main>
  );
}

function CreateDesignDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { t, locale } = useLanguageStore();
  const ds = t.admin.designStudio;
  const [targetType, setTargetType] = useState<DesignTargetType>("notebook");
  const [title, setTitle] = useState(ds.defaultTitle);
  const [mugId, setMugId] = useState("");
  const [nbId, setNbId] = useState("");
  const [widthCm, setWidthCm] = useState("14");
  const [heightCm, setHeightCm] = useState("21.4");
  const [mugs, setMugs] = useState<MugProductOption[]>([]);
  const [notebooks, setNotebooks] = useState<NotebookProductOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/admin/wizard-bootstrap")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { mugProducts?: MugProductOption[]; notebookProducts?: NotebookProductOption[] } | null) => {
        if (!data) return;
        const mugOpts = data.mugProducts ?? [];
        const nbOpts = data.notebookProducts ?? [];
        setMugs(mugOpts);
        setNotebooks(nbOpts);
        if (mugOpts[0]) setMugId(mugOpts[0].id);
        if (nbOpts[0]) setNbId(nbOpts[0].id);
      });
  }, []);

  const mugSelectOptions = useMemo<MenuSelectOption<string>[]>(
    () =>
      mugs.map((p) => ({
        value: p.id,
        label: mugProductDisplayName(p, locale),
        description: p.sku,
        leading: catalogThumb(p.imagePublicUrl, p.bodyColorHex),
      })),
    [mugs, locale],
  );

  const notebookSelectOptions = useMemo<MenuSelectOption<string>[]>(
    () =>
      notebooks.map((p) => ({
        value: p.id,
        label: notebookProductDisplayName(p, locale),
        description: p.sku,
        leading: catalogThumb(p.imagePublicUrl, p.coverColorHex),
      })),
    [notebooks, locale],
  );

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { title: title.trim() || ds.defaultTitle, targetType };
      if (targetType === "mug") body.mugProductId = mugId;
      if (targetType === "notebook") body.notebookProductId = nbId;
      if (targetType === "custom") {
        body.widthCm = Number(widthCm.replace(",", "."));
        body.heightCm = Number(heightCm.replace(",", "."));
        body.dpi = 300;
      }
      const res = await fetch("/api/admin/designs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { item?: { id: string }; error?: string };
      if (!res.ok || !data.item) throw new Error(data.error ?? "create_failed");
      onCreated(data.item.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : ds.createFailed);
    } finally {
      setBusy(false);
    }
  };

  const targetOptions: readonly { id: DesignTargetType; label: string }[] = [
    { id: "notebook", label: ds.targetNotebook },
    { id: "mug", label: ds.targetMug },
    { id: "custom", label: ds.targetCustom },
  ];

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={() => !busy && onClose()} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white text-gray-900 shadow-2xl ring-1 ring-black/5"
      >
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="text-lg font-bold tracking-tight text-gray-900">{ds.createTitle}</h2>
        </div>
        <div className="space-y-3 px-5 py-4">
          <label className="block text-xs font-medium text-gray-600">
            {ds.nameLabel}
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" />
          </label>
          <div className="flex gap-2">
            {targetOptions.map((opt) => (
              <Button
                key={opt.id}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setTargetType(opt.id)}
                className={cn("flex-1", targetType === opt.id && ACTIVE_CHIP)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
          {targetType === "mug" && mugSelectOptions.length > 0 && (
            <MenuSelect
              value={mugId || mugSelectOptions[0].value}
              onChange={setMugId}
              options={mugSelectOptions}
              searchable
              searchPlaceholder={ds.search}
            />
          )}
          {targetType === "notebook" && notebookSelectOptions.length > 0 && (
            <MenuSelect
              value={nbId || notebookSelectOptions[0].value}
              onChange={setNbId}
              options={notebookSelectOptions}
              searchable
              searchPlaceholder={ds.search}
            />
          )}
          {targetType === "custom" && (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-gray-600">
                {ds.widthCm}
                <Input value={widthCm} onChange={(e) => setWidthCm(e.target.value)} className="mt-1" />
              </label>
              <label className="text-xs text-gray-600">
                {ds.heightCm}
                <Input value={heightCm} onChange={(e) => setHeightCm(e.target.value)} className="mt-1" />
              </label>
            </div>
          )}
          {error && <p className="text-xs text-red-600">{error === "create_failed" ? ds.createFailed : error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {ds.cancel}
          </Button>
          <Button type="button" disabled={busy} onClick={() => void submit()}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            {ds.create}
          </Button>
        </div>
      </div>
    </div>
  );
}
