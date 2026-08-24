"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2, Search, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { NavLinkButton } from "@/components/ui/NavLinkButton";
import { FileDropzone } from "@/components/upload/FileDropzone";
import { AdminConfirmDialog } from "@/app/admin/_components/AdminConfirmDialog";
import { adminTableOutlineIconButtonClass } from "@/app/admin/_components/AdminTableIconActions";
import { resolveDesignFileUrl } from "@/lib/design/fileUrls";
import { getImageDimensions } from "@/lib/imageDimensions";
import type { AdminDesignAssetJson } from "@/app/api/admin/design-assets/route";
import { useLanguageStore } from "@/stores/useLanguageStore";

async function uploadDesignAssetFile(file: File): Promise<string> {
  const res = await fetch("/api/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type || "image/png",
      scope: "designAsset",
    }),
  });
  if (!res.ok) throw new Error("upload_url_failed");
  const { uploadUrl, fileKey } = (await res.json()) as {
    uploadUrl: string;
    fileKey: string;
  };
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type || "image/png" },
    body: file,
  });
  if (!put.ok) throw new Error("upload_failed");
  return fileKey;
}

export default function DesignAssetsClient() {
  const { t } = useLanguageStore();
  const ds = t.admin.designStudio;
  const [items, setItems] = useState<AdminDesignAssetJson[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newTags, setNewTags] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (category) params.set("category", category);
    void fetch(`/api/admin/design-assets?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : { items: [], categories: [] }))
      .then((data: { items: AdminDesignAssetJson[]; categories: string[] }) => {
        setItems(data.items ?? []);
        setCategories(data.categories ?? []);
      })
      .finally(() => setLoading(false));
  }, [query, category]);

  useEffect(() => {
    const timer = window.setTimeout(reload, 200);
    return () => window.clearTimeout(timer);
  }, [reload]);

  const handleFiles = async (files: File[]) => {
    setBusy(true);
    setError(null);
    try {
      for (const file of files) {
        await getImageDimensions(file);
        const fileKey = await uploadDesignAssetFile(file);
        const tags = newTags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean);
        const res = await fetch("/api/admin/design-assets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: newName.trim() || file.name.replace(/\.[^.]+$/, ""),
            category: newCategory.trim() || null,
            tags,
            fileKey,
          }),
        });
        if (!res.ok) throw new Error("register_failed");
      }
      setNewName("");
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "upload_failed");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setDeleteBusy(true);
    try {
      await fetch(`/api/admin/design-assets/${id}`, { method: "DELETE" });
      setDeleteId(null);
      reload();
    } finally {
      setDeleteBusy(false);
    }
  };

  const categoryOptions = [
    { value: "", label: ds.allCategories },
    ...categories.map((value) => ({ value, label: value })),
  ];

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-5">
      <NavLinkButton
        href="/admin/design-studio"
        variant="ghost"
        size="sm"
        className="px-0 text-gray-600 hover:text-gray-900"
        leadingIcon={<ArrowLeft className="h-4 w-4" />}
      >
        {ds.backToLibrary}
      </NavLinkButton>
      <h1 className="mt-3 text-2xl font-bold tracking-tight text-gray-900">{ds.clipartTitle}</h1>
      <p className="mt-1 text-sm text-gray-500">{ds.clipartSubtitle}</p>

      <div className="mt-5 grid gap-6 lg:grid-cols-[20rem_1fr]">
        <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-800">{ds.uploadHeading}</h2>
          <label className="block text-xs text-gray-600">
            {ds.nameLabel}
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} className="mt-1" />
          </label>
          <label className="block text-xs text-gray-600">
            {ds.categoryLabel}
            <Input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder={ds.categoryPlaceholder}
              className="mt-1"
            />
          </label>
          <label className="block text-xs text-gray-600">
            {ds.tagsLabel}
            <Input value={newTags} onChange={(e) => setNewTags(e.target.value)} className="mt-1" />
          </label>
          <FileDropzone
            accept="image/png,image/webp,image/jpeg"
            multiple
            disabled={busy}
            onFiles={(files) => void handleFiles(files)}
            className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-3 py-8 text-center hover:border-amber-400 hover:bg-amber-50"
            dragActiveClassName="border-amber-400 bg-amber-50"
            ariaLabel={ds.dropClipart}
          >
            {busy ? (
              <Loader2 className="h-6 w-6 animate-spin text-amber-700" aria-hidden />
            ) : (
              <Upload className="h-6 w-6 text-gray-400" aria-hidden />
            )}
            <span className="text-sm text-gray-700">{ds.dropClipart}</span>
          </FileDropzone>
          {error && <p className="text-xs text-red-600">{ds.uploadFailed}</p>}
        </section>

        <section>
          <div className="mb-3 flex flex-wrap gap-2">
            <div className="relative min-w-[12rem] flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={ds.search}
                className="pl-8"
                aria-label={ds.search}
              />
            </div>
            {categories.length > 0 && (
              <MenuSelect
                value={category}
                onChange={setCategory}
                options={categoryOptions}
                ariaLabel={ds.allCategories}
                className="w-auto min-w-[12rem]"
              />
            )}
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" aria-hidden />
            </div>
          ) : items.length === 0 ? (
            <p className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
              {ds.emptyAssets}
            </p>
          ) : (
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
              {items.map((asset) => (
                <li key={asset.id} className="group overflow-hidden rounded-lg border border-gray-200 bg-white">
                  <div className="flex aspect-square items-center justify-center bg-gray-50 p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={resolveDesignFileUrl(asset.thumbKey ?? asset.fileKey)}
                      alt={asset.name}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                  <div className="flex items-start justify-between gap-1 p-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-gray-800">{asset.name}</p>
                      {asset.category && <p className="truncate text-[10px] text-gray-500">{asset.category}</p>}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      title={ds.delete}
                      className={adminTableOutlineIconButtonClass}
                      onClick={() => setDeleteId(asset.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <AdminConfirmDialog
        open={deleteId !== null}
        title={ds.deleteAssetTitle}
        description={ds.deleteAssetDescription}
        confirmLabel={ds.delete}
        cancelLabel={ds.cancel}
        confirmVariant="destructive"
        busy={deleteBusy}
        onConfirm={() => {
          if (deleteId) void remove(deleteId);
        }}
        onClose={() => {
          if (!deleteBusy) setDeleteId(null);
        }}
      />
    </main>
  );
}
