"use client";

import { useState, useMemo, Fragment } from "react";
import { useRouter } from "next/navigation";
import {
  Pencil, Trash2, ChevronDown, ChevronUp, Loader2,
  Search, ChevronLeft, ChevronRight,
  icons,
} from "lucide-react";
import type { useLanguageStore } from "@/stores/useLanguageStore";
import type { CategoryListItem } from "./CatalogPageClient";
import type { AttributeSchema } from "@/lib/validations";

const PAGE_SIZE = 10;

interface Props {
  categories: CategoryListItem[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  t: ReturnType<typeof useLanguageStore.getState>["t"];
}

function CategoryIcon({ name }: { name: string }) {
  const Icon = icons[name as keyof typeof icons];
  return Icon ? <Icon className="w-4 h-4 text-gray-500 flex-shrink-0" /> : null;
}

export default function CategoriesTab({ categories, loading, onRefresh, t }: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    if (!search.trim()) return categories;
    const q = search.toLowerCase();
    return categories.filter(
      (c) => c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q),
    );
  }, [categories, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t.admin.catalogDeleteCategoryConfirm)) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/admin/categories/${id}`, { method: "DELETE" });
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
            placeholder={t.admin.catalogSearchCategories}
            className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-950 placeholder:text-gray-400"
          />
        </div>
        <span className="text-xs text-gray-400">
          {filtered.length} / {categories.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500 bg-white rounded-lg border border-gray-200">
          {search ? t.admin.noResults : t.admin.catalogNoCategories}
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">{t.admin.catalogName}</th>
                <th className="px-4 py-3">{t.admin.catalogSlug}</th>
                <th className="px-4 py-3 text-center">{t.admin.catalogProductsCount}</th>
                <th className="px-4 py-3 text-center">{t.admin.catalogFieldsCount}</th>
                <th className="px-4 py-3 text-center">{t.common.status}</th>
                <th className="px-4 py-3 w-20">{t.common.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginated.map((cat) => {
                const schema = cat.attributeSchema as AttributeSchema | null;
                const isExpanded = expandedId === cat.id;
                return (
                  <Fragment key={cat.id}>
                  <tr
                    className="cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => router.push(`/admin/catalog/categories/${cat.id}`)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {cat.icon && <CategoryIcon name={cat.icon} />}
                        <span className="text-sm font-medium text-gray-900">{cat.name}</span>
                      </div>
                      {cat.description && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[250px]">{cat.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded">{cat.slug}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm text-gray-700">{cat._count.products}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={(e) => { e.stopPropagation(); setExpandedId(isExpanded ? null : cat.id); }}
                        className="inline-flex items-center gap-1 text-sm text-gray-700 hover:text-gray-900"
                      >
                        {schema?.fields?.length ?? 0}
                        {(schema?.fields?.length ?? 0) > 0 && (
                          isExpanded
                            ? <ChevronUp className="w-3 h-3" />
                            : <ChevronDown className="w-3 h-3" />
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                        cat.isActive ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
                      }`}>
                        {cat.isActive ? t.admin.catalogActive : t.admin.catalogInactive}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); router.push(`/admin/catalog/categories/${cat.id}`); }}
                          className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                          title={t.admin.catalogEditCategory}
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(cat.id); }}
                          disabled={deleting === cat.id || cat._count.orderItems > 0}
                          className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40"
                          title={cat._count.orderItems > 0 ? "Has order items" : t.admin.catalogDeleteCategory}
                        >
                          {deleting === cat.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && schema?.fields && schema.fields.length > 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 pb-3 pt-0 bg-gray-50/50">
                        <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-1.5">
                          <p className="font-medium text-gray-600 mb-2">{t.admin.catalogAttributeFields}:</p>
                          {schema.fields.map((field) => (
                            <div key={field.key} className="flex items-center gap-2 text-gray-600">
                              <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-gray-200">{field.key}</span>
                              <span className="text-gray-400">{field.type}</span>
                              {field.required && <span className="text-red-400">*</span>}
                              {field.options && (
                                <span className="text-gray-400">
                                  [{field.options.map((o) => o.value).join(", ")}]
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
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
