"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { NavLinkButton } from "@/components/ui/NavLinkButton";
import { AdminConfirmDialog } from "@/app/admin/_components/AdminConfirmDialog";
import { adminTableOutlineIconButtonClass } from "@/app/admin/_components/AdminTableIconActions";
import { resolveDesignFileUrl } from "@/lib/design/fileUrls";
import type { DesignListItemJson } from "@/lib/design/designJson";
import type { DesignStatus, DesignTargetType } from "@/lib/design/doc";
import type { MugProductOption } from "@/app/mug/_components/MugProductPicker";
import type { NotebookProductOption } from "@/app/notebook/_components/NotebookProductPicker";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { cn } from "@/lib/utils";

interface CatalogOption {
  id: string;
  sku: string;
  nameRu: string;
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
  const [status, setStatus] = useState("");
  const [tag, setTag] = useState("");
  const [templatesOnly, setTemplatesOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (status) params.set("status", status);
    if (tag) params.set("tag", tag);
    if (templatesOnly) params.set("templates", "1");
    void fetch(`/api/admin/designs?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : { items: [], tags: [] }))
      .then((data: { items: DesignListItemJson[]; tags: string[] }) => {
        setItems(data.items ?? []);
        setTags(data.tags ?? []);
      })
      .finally(() => setLoading(false));
  }, [query, status, tag, templatesOnly]);

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

  const selectedReadyIds = useMemo(
    () => items.filter((d) => selected.has(d.id) && d.renderKey).map((d) => d.id),
    [items, selected],
  );

  const createOrderFrom = (ids: string[]) => {
    if (ids.length === 0) return;
    router.push(`/admin/orders/new?designs=${ids.join(",")}`);
  };

  const duplicateOne = async (id: string) => {
    const res = await fetch(`/api/admin/designs/${id}/duplicate`, { method: "POST" });
    if (!res.ok) return;
    const data = (await res.json()) as { item: { id: string } };
    router.push(`/admin/design-studio/${data.item.id}`);
  };

  const archiveSelected = async () => {
    setArchiveBusy(true);
    try {
      await Promise.all(
        [...selected].map((id) =>
          fetch(`/api/admin/designs/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "archived" }),
          }),
        ),
      );
      setSelected(new Set());
      setArchiveOpen(false);
      reload();
    } finally {
      setArchiveBusy(false);
    }
  };

  const statusOptions = [
    { value: "", label: ds.statusAll },
    { value: "draft", label: ds.statusDraft },
    { value: "ready", label: ds.statusReady },
    { value: "archived", label: ds.statusArchived },
  ];

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
        <MenuSelect
          value={status}
          onChange={setStatus}
          options={statusOptions}
          ariaLabel={ds.statusAll}
          className="w-auto min-w-[12rem]"
        />
        {tags.length > 0 && (
          <MenuSelect
            value={tag}
            onChange={setTag}
            options={tagOptions}
            ariaLabel={ds.allTags}
            className="w-auto min-w-[10rem]"
          />
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(templatesOnly && ACTIVE_CHIP)}
          onClick={() => setTemplatesOnly((v) => !v)}
        >
          {ds.templatesOnly}
        </Button>
      </div>

      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
          <span className="font-medium text-amber-800">{ds.selectedCount(selected.size)}</span>
          <Button
            type="button"
            size="sm"
            disabled={selectedReadyIds.length === 0}
            onClick={() => createOrderFrom(selectedReadyIds)}
          >
            <ShoppingCart className="h-3.5 w-3.5" aria-hidden />
            {ds.createOrder}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setArchiveOpen(true)}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            {ds.archive}
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
                <div className="space-y-1 p-2.5">
                  <p className="truncate text-sm font-medium text-gray-900">{item.title}</p>
                  <p className="truncate text-[11px] text-gray-500">
                    {item.productSku ?? ds.sizeCm(item.widthCm, item.heightCm)}
                  </p>
                  <StatusBadge status={item.status} isTemplate={item.isTemplate} />
                </div>
              </Link>
              <div className="absolute right-2 bottom-2 hidden gap-1 group-hover:flex">
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
                {item.renderKey && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    title={ds.toOrder}
                    className={adminTableOutlineIconButtonClass}
                    onClick={() => createOrderFrom([item.id])}
                  >
                    <ShoppingCart className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                )}
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
        open={archiveOpen}
        title={ds.archiveTitle}
        description={ds.archiveDescription}
        confirmLabel={ds.archive}
        cancelLabel={ds.cancel}
        confirmVariant="default"
        busy={archiveBusy}
        onConfirm={() => void archiveSelected()}
        onClose={() => {
          if (!archiveBusy) setArchiveOpen(false);
        }}
      />
    </main>
  );
}

function StatusBadge({ status, isTemplate }: { status: DesignStatus; isTemplate: boolean }) {
  const { t } = useLanguageStore();
  const ds = t.admin.designStudio;
  const label = status === "ready" ? ds.ready : status === "archived" ? ds.archived : ds.draft;
  const variant = status === "ready" ? "success" : status === "archived" ? "secondary" : "warning";
  return (
    <div className="flex flex-wrap gap-1">
      <Badge variant={variant} className="px-1.5 py-0 text-[10px]">
        {label}
      </Badge>
      {isTemplate && (
        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
          {ds.template}
        </Badge>
      )}
    </div>
  );
}

function CreateDesignDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { t } = useLanguageStore();
  const ds = t.admin.designStudio;
  const [targetType, setTargetType] = useState<DesignTargetType>("notebook");
  const [title, setTitle] = useState(ds.defaultTitle);
  const [mugId, setMugId] = useState("");
  const [nbId, setNbId] = useState("");
  const [widthCm, setWidthCm] = useState("14");
  const [heightCm, setHeightCm] = useState("21.4");
  const [mugs, setMugs] = useState<CatalogOption[]>([]);
  const [notebooks, setNotebooks] = useState<CatalogOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/admin/wizard-bootstrap")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { mugProducts?: MugProductOption[]; notebookProducts?: NotebookProductOption[] } | null) => {
        if (!data) return;
        const mugOpts = (data.mugProducts ?? []).map((p) => ({
          id: p.id,
          sku: p.sku,
          nameRu: p.nameRu,
        }));
        const nbOpts = (data.notebookProducts ?? []).map((p) => ({
          id: p.id,
          sku: p.sku,
          nameRu: p.nameRu,
        }));
        setMugs(mugOpts);
        setNotebooks(nbOpts);
        if (mugOpts[0]) setMugId(mugOpts[0].id);
        if (nbOpts[0]) setNbId(nbOpts[0].id);
      });
  }, []);

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
          {targetType === "mug" && mugs.length > 0 && (
            <MenuSelect
              value={mugId || mugs[0].id}
              onChange={setMugId}
              options={mugs.map((p) => ({ value: p.id, label: `${p.sku} — ${p.nameRu}` }))}
              searchable
              searchPlaceholder={ds.search}
            />
          )}
          {targetType === "notebook" && notebooks.length > 0 && (
            <MenuSelect
              value={nbId || notebooks[0].id}
              onChange={setNbId}
              options={notebooks.map((p) => ({ value: p.id, label: `${p.sku} — ${p.nameRu}` }))}
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
