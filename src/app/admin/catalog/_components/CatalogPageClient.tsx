"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { Button } from "@/components/ui/button";
import { Package, Layers, Plus } from "lucide-react";
import CategoriesTab from "./CategoriesTab";
import ProductsTab from "./ProductsTab";

interface CategoryListItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  attributeSchema: unknown;
  sortOrder: number;
  isActive: boolean;
  _count: { products: number; orderItems: number };
}

interface ProductListItem {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  imageUrl: string | null;
  attributes: unknown;
  isActive: boolean;
  categoryId: string;
  category: { id: string; name: string; slug: string };
  _count: { orderItems: number };
}

export type { CategoryListItem, ProductListItem };

export default function CatalogPageClient() {
  const { t } = useLanguageStore();
  const router = useRouter();
  const [tab, setTab] = useState<"categories" | "products">("categories");
  const [categories, setCategories] = useState<CategoryListItem[]>([]);
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCategories = useCallback(async () => {
    const res = await fetch("/api/admin/categories");
    if (!res.ok) throw new Error("Failed to fetch categories");
    return res.json() as Promise<CategoryListItem[]>;
  }, []);

  const fetchProducts = useCallback(async () => {
    const res = await fetch("/api/admin/products");
    if (!res.ok) throw new Error("Failed to fetch products");
    return res.json() as Promise<ProductListItem[]>;
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [cats, prods] = await Promise.all([fetchCategories(), fetchProducts()]);
      setCategories(cats);
      setProducts(prods);
    } catch {
      /* handled */
    } finally {
      setLoading(false);
    }
  }, [fetchCategories, fetchProducts]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleCreate = () => {
    if (tab === "categories") {
      router.push("/admin/catalog/categories/new");
    } else {
      router.push("/admin/catalog/products/new");
    }
  };

  return (
    <>
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="px-6 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900">{t.admin.catalog}</h1>
          <Button size="sm" onClick={handleCreate}>
            <Plus className="w-4 h-4" />
            {tab === "categories" ? t.admin.catalogNewCategory : t.admin.catalogNewProduct}
          </Button>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-6 py-6">
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5 w-fit mb-5">
          <button
            onClick={() => setTab("categories")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === "categories"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            {t.admin.catalogCategories}
            <span className="text-xs opacity-60">({categories.length})</span>
          </button>
          <button
            onClick={() => setTab("products")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === "products"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            {t.admin.catalogProducts}
            <span className="text-xs opacity-60">({products.length})</span>
          </button>
        </div>

        {tab === "categories" ? (
          <CategoriesTab
            categories={categories}
            loading={loading}
            onRefresh={refresh}
            t={t}
          />
        ) : (
          <ProductsTab
            products={products}
            categories={categories}
            loading={loading}
            onRefresh={refresh}
            t={t}
          />
        )}
      </div>
    </>
  );
}
