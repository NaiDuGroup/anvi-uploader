"use client";

import { useState, useCallback, useEffect } from "react";
import { useOrdersStore } from "@/stores/useOrdersStore";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { generatePreview } from "@/lib/generatePreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  X, Plus, Upload, FileText, Trash2, Loader2,
} from "lucide-react";
import type { AttributeSchema, AttributeField, PricingModel, PriceTier, Surcharge } from "@/lib/validations";
import { calculatePrice } from "@/lib/priceCalculator";

interface CategoryOption {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  pricingModel: PricingModel;
  servicePriceDefault: number | null;
  dimensionsRequired: boolean;
  surcharges: Surcharge[] | null;
  attributeSchema: AttributeSchema;
}

interface ProductOption {
  id: string;
  name: string;
  sku: string;
  categoryId: string;
  costPrice: number | null;
  sellingPrice: number | null;
  priceTiers: PriceTier[] | null;
}

interface ItemFileEntry {
  file: File;
  pageCount?: number;
  previewUrl?: string;
}

interface OrderItemForm {
  categoryId: string;
  productId: string;
  customerProvided: boolean;
  quantity: number;
  width: string;
  height: string;
  unitPrice: string;
  totalPrice: string;
  priceOverride: boolean;
  activeSurchargeKeys: string[];
  attributes: Record<string, unknown>;
  notes: string;
  files: ItemFileEntry[];
}

function emptyItem(): OrderItemForm {
  return {
    categoryId: "",
    productId: "",
    customerProvided: false,
    quantity: 1,
    width: "",
    height: "",
    unitPrice: "",
    totalPrice: "",
    priceOverride: false,
    activeSurchargeKeys: [],
    attributes: {},
    notes: "",
    files: [],
  };
}

function calculateItemPrice(
  item: OrderItemForm,
  category: CategoryOption | undefined,
  product: ProductOption | undefined,
): { unitPrice: number; totalPrice: number } | null {
  if (item.priceOverride) {
    const up = parseFloat(item.unitPrice) || 0;
    const tp = parseFloat(item.totalPrice) || up * item.quantity;
    return { unitPrice: up, totalPrice: tp };
  }

  return calculatePrice(category, product ?? undefined, {
    quantity: item.quantity,
    width: parseFloat(item.width) || undefined,
    height: parseFloat(item.height) || undefined,
    activeSurchargeKeys: item.activeSurchargeKeys,
  });
}

export default function CreateOrderModal({
  t,
  onClose,
  onCreated,
}: {
  t: ReturnType<typeof useLanguageStore.getState>["t"];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { createAdminOrder } = useOrdersStore();
  const { locale } = useLanguageStore();
  const [phone, setPhone] = useState("");
  const [clientName, setClientName] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<OrderItemForm[]>([emptyItem()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/categories").then((r) => r.json()),
      fetch("/api/admin/products").then((r) => r.json()),
    ]).then(([cats, prods]) => {
      setCategories(
        (cats as CategoryOption[]).map((c) => ({
          ...c,
          pricingModel: (c.pricingModel as PricingModel) || "fixed",
          servicePriceDefault: c.servicePriceDefault ?? null,
          dimensionsRequired: c.dimensionsRequired ?? false,
          surcharges: (c.surcharges as Surcharge[] | null) ?? null,
          attributeSchema: (c.attributeSchema as AttributeSchema) ?? { fields: [] },
        })),
      );
      setProducts(
        (prods as ProductOption[]).map((p) => ({
          ...p,
          costPrice: p.costPrice ?? null,
          sellingPrice: p.sellingPrice ?? null,
          priceTiers: (p.priceTiers as PriceTier[] | null) ?? null,
        })),
      );
      setLoadingCatalog(false);
    }).catch(() => setLoadingCatalog(false));
  }, []);

  const updateItem = (index: number, patch: Partial<OrderItemForm>) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const removeItem = (index: number) => {
    setItems((prev) => {
      if (prev.length <= 1) return prev;
      const entry = prev[index];
      entry.files.forEach((f) => {
        if (f.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(f.previewUrl);
      });
      return prev.filter((_, i) => i !== index);
    });
  };

  const addFiles = useCallback(async (itemIndex: number, newFiles: FileList | null) => {
    if (!newFiles) return;
    const entries: ItemFileEntry[] = await Promise.all(
      Array.from(newFiles).map(async (file) => {
        let pageCount: number | undefined;
        if (file.type === "application/pdf") {
          try {
            const { PDFDocument } = await import("pdf-lib");
            const buf = await file.arrayBuffer();
            const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
            pageCount = doc.getPageCount();
          } catch { /* non-countable PDF */ }
        }
        const previewUrl = await generatePreview(file);
        return { file, pageCount, previewUrl };
      }),
    );
    setItems((prev) => {
      const next = [...prev];
      next[itemIndex] = { ...next[itemIndex], files: [...next[itemIndex].files, ...entries] };
      return next;
    });
  }, []);

  const removeFile = (itemIndex: number, fileIndex: number) => {
    setItems((prev) => {
      const next = [...prev];
      const item = { ...next[itemIndex] };
      const entry = item.files[fileIndex];
      if (entry?.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(entry.previewUrl);
      item.files = item.files.filter((_, i) => i !== fileIndex);
      next[itemIndex] = item;
      return next;
    });
  };

  const handleCategoryChange = (itemIndex: number, categoryId: string) => {
    const cat = categories.find((c) => c.id === categoryId);
    const defaults: Record<string, unknown> = {};
    if (cat) {
      for (const field of cat.attributeSchema.fields) {
        if (field.defaultValue !== undefined) {
          defaults[field.key] = field.defaultValue;
        }
      }
    }
    updateItem(itemIndex, { categoryId, productId: "", attributes: defaults });
  };

  const handleSubmit = async () => {
    if (items.length === 0 || phone.length < 8) return;
    const hasFiles = items.every((item) => item.files.length > 0);
    if (!hasFiles) return;

    setSubmitting(true);
    setError("");

    try {
      const itemsData = await Promise.all(
        items.map(async (item) => {
          const fileData = await Promise.all(
            item.files.map(async (entry) => {
              const res = await fetch("/api/upload-url", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  fileName: entry.file.name,
                  contentType: entry.file.type || "application/octet-stream",
                }),
              });
              if (!res.ok) throw new Error("Failed to get upload URL");
              const { uploadUrl, fileKey } = await res.json();

              const uploadRes = await fetch(uploadUrl, {
                method: "PUT",
                headers: { "Content-Type": entry.file.type || "application/octet-stream" },
                body: entry.file,
              });
              if (!uploadRes.ok) throw new Error("Failed to upload file");

              return {
                fileName: entry.file.name,
                fileUrl: fileKey,
                pageCount: entry.pageCount,
              };
            }),
          );

          const cat = categories.find((c) => c.id === item.categoryId);
          const prod = products.find((p) => p.id === item.productId);
          const price = calculateItemPrice(item, cat, prod);

          return {
            categoryId: item.categoryId || undefined,
            productId: item.productId || undefined,
            customerProvided: item.customerProvided,
            quantity: item.quantity,
            width: parseFloat(item.width) || undefined,
            height: parseFloat(item.height) || undefined,
            unitPrice: price?.unitPrice ?? (parseFloat(item.unitPrice) || undefined),
            totalPrice: price?.totalPrice ?? (parseFloat(item.totalPrice) || undefined),
            priceOverride: item.priceOverride || undefined,
            attributes: Object.keys(item.attributes).length > 0 ? item.attributes : undefined,
            notes: item.notes.trim() || undefined,
            files: fileData,
          };
        }),
      );

      await createAdminOrder({
        phone,
        clientName: clientName.trim() || undefined,
        notes: notes.trim() || undefined,
        items: itemsData,
      });

      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create order");
    } finally {
      setSubmitting(false);
    }
  };

  const hasAllFiles = items.every((item) => item.files.length > 0);
  const canSubmit = items.length > 0 && phone.length >= 8 && hasAllFiles && !submitting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-2xl w-full p-6 text-gray-900 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-6">
          <Plus className="w-5 h-5 text-gold" />
          <h2 className="text-lg font-bold">{t.admin.newOrder}</h2>
        </div>

        <div className="space-y-5">
          {/* Contact info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">{t.common.phone} *</label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                type="tel"
                placeholder={t.admin.clientPhonePlaceholder}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">{t.admin.clientName}</label>
              <Input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder={t.admin.clientNamePlaceholder}
              />
            </div>
          </div>

          {/* Order items */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">{t.admin.orderItems}</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setItems((prev) => [...prev, emptyItem()])}
              >
                <Plus className="w-3 h-3" />
                {t.admin.addItem}
              </Button>
            </div>

            {loadingCatalog ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            ) : (
              <div className="space-y-4">
                {items.map((item, itemIdx) => (
                  <OrderItemCard
                    key={itemIdx}
                    item={item}
                    itemIndex={itemIdx}
                    totalItems={items.length}
                    categories={categories}
                    products={products}
                    locale={locale}
                    t={t}
                    onUpdate={(patch) => updateItem(itemIdx, patch)}
                    onCategoryChange={(catId) => handleCategoryChange(itemIdx, catId)}
                    onAddFiles={(files) => addFiles(itemIdx, files)}
                    onRemoveFile={(fileIdx) => removeFile(itemIdx, fileIdx)}
                    onRemove={() => removeItem(itemIdx)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium mb-1.5">{t.upload.notesLabel}</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t.upload.notesPlaceholder}
              maxLength={500}
              rows={2}
              className="flex w-full rounded-md border border-gray-200 bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950 resize-none"
            />
          </div>

          {/* Order total */}
          {(() => {
            const total = items.reduce((sum, item) => {
              const cat = categories.find((c) => c.id === item.categoryId);
              const prod = products.find((p) => p.id === item.productId);
              const price = calculateItemPrice(item, cat, prod);
              return sum + (price?.totalPrice ?? 0);
            }, 0);
            if (total > 0) {
              return (
                <div className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
                  <span className="text-sm font-semibold text-gray-700">{t.admin.orderTotal}</span>
                  <span className="text-lg font-bold text-gray-900">{total.toFixed(2)} {t.admin.currency}</span>
                </div>
              );
            }
            return null;
          })()}

          {error && <p className="text-sm text-red-500 text-center">{error}</p>}

          <Button
            onClick={handleSubmit}
            className="w-full"
            size="lg"
            disabled={!canSubmit}
          >
            {submitting ? t.admin.creatingOrder : t.admin.createOrder}
          </Button>
        </div>
      </div>
    </div>
  );
}

function OrderItemCard({
  item,
  itemIndex,
  totalItems,
  categories,
  products,
  locale,
  t,
  onUpdate,
  onCategoryChange,
  onAddFiles,
  onRemoveFile,
  onRemove,
}: {
  item: OrderItemForm;
  itemIndex: number;
  totalItems: number;
  categories: CategoryOption[];
  products: ProductOption[];
  locale: string;
  t: ReturnType<typeof useLanguageStore.getState>["t"];
  onUpdate: (patch: Partial<OrderItemForm>) => void;
  onCategoryChange: (categoryId: string) => void;
  onAddFiles: (files: FileList | null) => void;
  onRemoveFile: (index: number) => void;
  onRemove: () => void;
}) {
  const [dragActive, setDragActive] = useState(false);
  const selectedCategory = categories.find((c) => c.id === item.categoryId);
  const categoryProducts = products.filter(
    (p) => p.categoryId === item.categoryId,
  );
  const schema = selectedCategory?.attributeSchema;

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    onAddFiles(e.dataTransfer.files);
  };

  const setAttr = (key: string, value: unknown) => {
    onUpdate({ attributes: { ...item.attributes, [key]: value } });
  };

  return (
    <div className="border border-gray-200 rounded-xl p-4 space-y-3 relative">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500 uppercase">
          {t.admin.orderPosition(itemIndex + 1)}
        </span>
        {totalItems > 1 && (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-red-500 hover:text-red-600 font-medium flex items-center gap-1"
          >
            <Trash2 className="w-3 h-3" />
            {t.admin.removeItem}
          </button>
        )}
      </div>

      {/* Category + Product selectors */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t.admin.selectCategory}</label>
          <select
            value={item.categoryId}
            onChange={(e) => onCategoryChange(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold"
          >
            <option value="">{t.admin.selectCategory}</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </div>
        <div>
          {!item.customerProvided && item.categoryId && (
            <>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t.admin.selectProduct}</label>
              <select
                value={item.productId}
                onChange={(e) => onUpdate({ productId: e.target.value })}
                className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold"
              >
                <option value="">{t.admin.selectProduct}</option>
                {categoryProducts.map((prod) => (
                  <option key={prod.id} value={prod.id}>
                    {prod.sku} — {prod.name}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>

      {/* Customer provided toggle */}
      {item.categoryId && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={item.customerProvided}
            onChange={(e) => onUpdate({ customerProvided: e.target.checked, productId: "" })}
            className="h-4 w-4 rounded border-gray-300 accent-amber-500"
          />
          <span className="text-sm text-gray-600">{t.admin.customerProvided}</span>
          <span className="text-xs text-gray-400">— {t.admin.customerProvidedHint}</span>
        </label>
      )}

      {/* Dynamic attributes */}
      {schema && schema.fields.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-3 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase">{t.admin.catalogAttributes}</p>
          <div className="grid grid-cols-2 gap-3">
            {schema.fields.map((field) => (
              <DynamicField
                key={field.key}
                field={field}
                value={item.attributes[field.key]}
                onChange={(val) => setAttr(field.key, val)}
                locale={locale}
              />
            ))}
          </div>
        </div>
      )}

      {/* Quantity + Dimensions + Price */}
      <div className="space-y-3">
        {(!schema || !schema.fields.some((f) => f.key === "copies" || f.key === "quantity")) && (
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-600">{t.admin.quantity}</label>
            <Input
              type="number"
              min={1}
              value={item.quantity}
              onChange={(e) => onUpdate({ quantity: Math.max(1, parseInt(e.target.value) || 1) })}
              className="w-24 text-right"
            />
          </div>
        )}

        {selectedCategory?.dimensionsRequired && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t.admin.width}</label>
              <Input
                type="number"
                step="0.1"
                min="0"
                value={item.width}
                onChange={(e) => onUpdate({ width: e.target.value })}
                placeholder="0"
                className="text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t.admin.height}</label>
              <Input
                type="number"
                step="0.1"
                min="0"
                value={item.height}
                onChange={(e) => onUpdate({ height: e.target.value })}
                placeholder="0"
                className="text-sm"
              />
            </div>
          </div>
        )}

        {/* Pricing section */}
        {selectedCategory && (
          <div className="bg-amber-50/60 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={item.priceOverride}
                  onChange={(e) => onUpdate({ priceOverride: e.target.checked })}
                  className="h-3.5 w-3.5 rounded border-gray-300 accent-amber-500"
                />
                <span className="text-xs font-medium text-gray-600">{t.admin.priceOverride}</span>
              </label>
              {(() => {
                const selectedProduct = products.find((p) => p.id === item.productId);
                const price = calculateItemPrice(item, selectedCategory, selectedProduct);
                if (price) {
                  return (
                    <span className="text-sm font-bold text-gray-900">
                      {price.totalPrice.toFixed(2)} {t.admin.currency}
                    </span>
                  );
                }
                return null;
              })()}
            </div>
            {item.priceOverride && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t.admin.unitPrice}</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={item.unitPrice}
                    onChange={(e) => {
                      const up = parseFloat(e.target.value) || 0;
                      onUpdate({
                        unitPrice: e.target.value,
                        totalPrice: String(Math.round(up * item.quantity * 100) / 100),
                      });
                    }}
                    placeholder="0.00"
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t.admin.totalPrice}</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={item.totalPrice}
                    onChange={(e) => onUpdate({ totalPrice: e.target.value })}
                    placeholder="0.00"
                    className="text-sm"
                  />
                </div>
              </div>
            )}
            {/* Surcharges */}
            {selectedCategory?.surcharges && selectedCategory.surcharges.length > 0 && (
              <div className="flex flex-wrap gap-3 pt-1">
                {selectedCategory.surcharges.map((sc) => (
                  <label key={sc.key} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={item.activeSurchargeKeys.includes(sc.key)}
                      onChange={(e) => {
                        const keys = e.target.checked
                          ? [...item.activeSurchargeKeys, sc.key]
                          : item.activeSurchargeKeys.filter((k) => k !== sc.key);
                        onUpdate({ activeSurchargeKeys: keys });
                      }}
                      className="h-3.5 w-3.5 rounded border-gray-300 accent-amber-500"
                    />
                    <span className="text-xs text-gray-600">
                      {(sc.label as Record<string, string>)[locale] ?? sc.label.en} (+{sc.pricePerUnit} {t.admin.currency})
                    </span>
                  </label>
                ))}
              </div>
            )}
            {!item.priceOverride && (() => {
              const selectedProduct = products.find((p) => p.id === item.productId);
              const price = calculateItemPrice(item, selectedCategory, selectedProduct);
              if (price) {
                return (
                  <p className="text-xs text-gray-500">
                    {price.unitPrice.toFixed(2)} {t.admin.currency} × {item.quantity} = {price.totalPrice.toFixed(2)} {t.admin.currency}
                  </p>
                );
              }
              return null;
            })()}
          </div>
        )}
      </div>

      {/* File upload */}
      <div>
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
            dragActive
              ? "border-gold bg-gold-light"
              : "border-gray-200 hover:border-gray-300"
          }`}
        >
          <Upload className="w-5 h-5 text-gray-400 mx-auto mb-1" />
          <p className="text-xs text-gray-500 mb-0.5">{t.upload.dragDrop}</p>
          <label className="cursor-pointer">
            <span className="text-gold hover:underline font-medium text-xs">
              {t.upload.browseFiles}
            </span>
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(e) => onAddFiles(e.target.files)}
            />
          </label>
        </div>

        {item.files.length > 0 && (
          <div className="border border-gray-100 rounded-lg divide-y divide-gray-50 mt-2">
            {item.files.map((entry, fileIdx) => (
              <div key={fileIdx} className="flex items-center gap-2 px-3 py-2">
                {entry.previewUrl ? (
                  <img
                    src={entry.previewUrl}
                    alt=""
                    className="w-10 h-10 rounded object-cover flex-shrink-0 bg-gray-100 border border-gray-200"
                  />
                ) : (
                  <div className="w-10 h-10 rounded bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4 text-gray-400" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-gray-900 truncate">{entry.file.name}</p>
                  <p className="text-[10px] text-gray-400">
                    {(entry.file.size / 1024).toFixed(1)} KB
                    {entry.pageCount !== undefined && ` · ${entry.pageCount} p.`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveFile(fileIdx)}
                  className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 flex-shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Item notes */}
      <div>
        <Input
          value={item.notes}
          onChange={(e) => onUpdate({ notes: e.target.value })}
          placeholder={t.admin.itemNotes}
          className="text-sm"
        />
      </div>
    </div>
  );
}

function DynamicField({
  field,
  value,
  onChange,
  locale,
}: {
  field: AttributeField;
  value: unknown;
  onChange: (val: unknown) => void;
  locale: string;
}) {
  const label = (field.label as Record<string, string>)[locale] ?? field.label.en;

  if (field.type === "select" && field.options) {
    return (
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          {label} {field.required && "*"}
        </label>
        <select
          value={String(value ?? field.defaultValue ?? "")}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold"
        >
          {!field.required && <option value="">—</option>}
          {field.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {(opt.label as Record<string, string>)[locale] ?? opt.label.en}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (field.type === "number") {
    return (
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          {label} {field.required && "*"}
        </label>
        <Input
          type="number"
          min={field.min}
          max={field.max}
          value={String(value ?? field.defaultValue ?? "")}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
          className="text-sm"
        />
      </div>
    );
  }

  if (field.type === "boolean") {
    return (
      <div className="flex items-center pt-5">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value ?? field.defaultValue ?? false)}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 accent-amber-500"
          />
          <span className="text-sm text-gray-700">{label}</span>
        </label>
      </div>
    );
  }

  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label} {field.required && "*"}
      </label>
      <Input
        value={String(value ?? field.defaultValue ?? "")}
        onChange={(e) => onChange(e.target.value)}
        className="text-sm"
      />
    </div>
  );
}
