"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguageStore } from "@/stores/useLanguageStore";
import {
  ArrowLeft,
  Loader2,
  PackagePlus,
  Plus,
  Search,
} from "lucide-react";
import { usePenProducts } from "@/lib/swr/usePenProducts";

export default function PenCatalogPageClient() {
  const { t } = useLanguageStore();
  const { products, isLoading } = usePenProducts();
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = products.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.sku.toLowerCase().includes(q) ||
      p.nameRo.toLowerCase().includes(q) ||
      p.nameRu.toLowerCase().includes(q) ||
      p.nameEn.toLowerCase().includes(q)
    );
  });

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin/stock"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-gray-50"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">
              {t.admin.penCatalogTitle ?? "Catalog pixuri"}
            </h1>
          </div>
          <p className="mt-1 text-sm text-gray-600">
            {t.admin.penCatalogSubtitle ?? "Gestionare stoc pixuri personalizate"}
          </p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          {t.admin.penCatalogAdd ?? "Adaugă pix"}
        </Button>
      </div>

      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            type="text"
            placeholder={t.admin.penCatalogSearchPlaceholder ?? "Caută după SKU sau nume..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-12 text-center">
          <PackagePlus className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-sm font-semibold text-gray-900">
            {searchQuery
              ? t.admin.penCatalogSearchEmpty ?? "Niciun rezultat"
              : t.admin.penCatalogEmpty ?? "Niciun pix în catalog"}
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {searchQuery
              ? t.admin.penCatalogSearchEmptyHint ?? "Încearcă alt termen de căutare"
              : t.admin.penCatalogEmptyHint ?? "Adaugă primul pix în catalog"}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  SKU
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t.admin.penCatalogColNameRo ?? "Nume (RO)"}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t.admin.penCatalogColStock ?? "Stoc"}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t.admin.penCatalogColPrice ?? "Preț"}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t.admin.penCatalogColStatus ?? "Status"}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {filtered.map((product) => (
                <tr key={product.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                    {product.sku}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">{product.nameRo}</td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                    {product.stockQuantity}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                    {product.sellPrice ? `${product.sellPrice} MDL` : "—"}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                        product.isActive
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {product.isActive
                        ? t.admin.penCatalogBadgeActive ?? "Activ"
                        : t.admin.penCatalogBadgeInactive ?? "Inactiv"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
