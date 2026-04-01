"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Pencil, Trash2, Loader2, Package, Search, ChevronLeft, ChevronRight,
} from "lucide-react";
import type { useLanguageStore } from "@/stores/useLanguageStore";
import type { CategoryListItem, ProductListItem } from "./CatalogPageClient";

const PAGE_SIZE = 10;

interface Props {
  products: ProductListItem[];
  categories: CategoryListItem[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  t: ReturnType<typeof useLanguageStore.getState>["t"];
}

export default function ProductsTab({ products, categories, loading, onRefresh, t }: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [filterCategoryId, setFilterCategoryId] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    let list = products;
    if (filterCategoryId) {
      list = list.filter((p) => p.categoryId === filterCategoryId);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.category.name.toLowerCase().includes(q),
      );
    }
    return list;
  }, [products, filterCategoryId, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleFilterChange = (value: string) => {
    setFilterCategoryId(value);
    setPage(1);
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t.admin.catalogDeleteProductConfirm)) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/admin/products/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body.error ?? "Failed to delete");
        return;
      }
      await onRefresh();
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={t.admin.catalogSearchProducts}
            className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-950 placeholder:text-gray-400"
          />
        </div>
        <select
          value={filterCategoryId}
          onChange={(e) => handleFilterChange(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-950"
        >
          <option value="">{t.admin.filterByCategoryAll}</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
        <span className="text-xs text-gray-400">
          {filtered.length} / {products.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500 bg-white rounded-lg border border-gray-200">
          {search || filterCategoryId ? t.admin.noResults : t.admin.catalogNoProducts}
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">{t.admin.catalogSku}</th>
                <th className="px-4 py-3">{t.admin.catalogName}</th>
                <th className="px-4 py-3">{t.admin.catalogCategories}</th>
                <th className="px-4 py-3 text-center">{t.common.status}</th>
                <th className="px-4 py-3 w-20">{t.common.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginated.map((prod) => (
                <tr
                  key={prod.id}
                  className="cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => router.push(`/admin/catalog/products/${prod.id}`)}
                >
                  <td className="px-4 py-3">
                    <span className="font-mono text-sm font-medium">{prod.sku}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium">{prod.name}</p>
                        {prod.description && (
                          <p className="text-xs text-gray-500 truncate max-w-[250px]">{prod.description}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{prod.category.name}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                      prod.isActive ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
                    }`}>
                      {prod.isActive ? t.admin.catalogActive : t.admin.catalogInactive}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); router.push(`/admin/catalog/products/${prod.id}`); }}
                        className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                        title={t.admin.catalogEditProduct}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(prod.id); }}
                        disabled={deleting === prod.id || prod._count.orderItems > 0}
                        className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40"
                        title={prod._count.orderItems > 0 ? "Has order items" : t.admin.catalogDeleteProduct}
                      >
                        {deleting === prod.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
              <span className="text-xs text-gray-500">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} / {filtered.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-1.5 rounded-md text-gray-500 hover:bg-gray-200 disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`min-w-[28px] h-7 rounded-md text-xs font-medium ${
                      p === page
                        ? "bg-gray-900 text-white"
                        : "text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-1.5 rounded-md text-gray-500 hover:bg-gray-200 disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
