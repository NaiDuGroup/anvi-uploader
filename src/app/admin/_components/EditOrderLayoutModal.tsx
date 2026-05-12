"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { useOrdersStore } from "@/stores/useOrdersStore";
import { InsufficientStockOrderError } from "@/lib/orderErrors";
import { exportCanvasAsBlob, blobToFile } from "@/lib/mug/exportLayout";
import type { SizeValidationResult } from "@/lib/imageDimensions";
import { parseMugProductSnapshot } from "@/lib/mug/mugProductSnapshot";
import { inferMugOrderUiMode } from "@/lib/mug/inferMugOrderUiMode";
import { parseNotebookProductSnapshot } from "@/lib/notebook/notebookProductSnapshot";
import { inferNotebookOrderUiMode } from "@/lib/notebook/inferNotebookOrderUiMode";
import {
  MUG_TEMPLATES,
  getTemplateById,
} from "@/lib/mug/templates";
import {
  NOTEBOOK_TEMPLATES,
  getTemplateById as getNotebookTemplateById,
} from "@/lib/notebook/templates";
import type {
  MugLayoutData,
  NotebookLayoutData,
} from "@/lib/validations";
import {
  type MugProductOption,
  type MugProductSelection,
} from "@/app/mug/_components/MugProductPicker";
import {
  type NotebookProductOption,
  type NotebookProductSelection,
} from "@/app/notebook/_components/NotebookProductPicker";

import {
  AdminCustomerForm,
  type CustomerFormValue,
  MugOrderForm,
  type MugFormValue,
  type MugOrderFormHandle,
  NotebookOrderForm,
  type NotebookFormValue,
  type NotebookOrderFormHandle,
  parseAdminCopiesInput,
} from "./orderForms";
import {
  resolveR2Key,
  uploadFile,
  uploadPhotoUrl,
} from "./orderForms/uploadHelpers";

export interface EditingMugOrder {
  orderId: string;
  mugLayoutData: MugLayoutData;
  mugProductId?: string | null;
  mugProductSnapshot?: Record<string, unknown> | null;
  phone?: string;
  clientName?: string | null;
  clientId?: string | null;
  studioClient?: {
    id: string;
    kind: string;
    phone: string | null;
    personName: string | null;
    companyName: string | null;
    companyIdno: string | null;
  } | null;
  notes?: string | null;
  price?: number | null;
  /** First layout file — used to reopen «upload ready» orders with preview + re-submit without new file */
  existingLayoutPreviewUrl?: string | null;
  existingLayoutFileName?: string | null;
  /** Total print qty (summed File.copies) for prefilling the quantity control */
  layoutCopies?: number;
}

export interface EditingNotebookOrder {
  orderId: string;
  notebookLayoutData: NotebookLayoutData;
  notebookProductId?: string | null;
  notebookProductSnapshot?: Record<string, unknown> | null;
  phone?: string;
  clientName?: string | null;
  clientId?: string | null;
  studioClient?: {
    id: string;
    kind: string;
    phone: string | null;
    personName: string | null;
    companyName: string | null;
    companyIdno: string | null;
  } | null;
  notes?: string | null;
  price?: number | null;
  existingLayoutPreviewUrl?: string | null;
  existingLayoutFileName?: string | null;
  layoutCopies?: number;
}

function initialMugSelection(em?: EditingMugOrder): MugProductSelection | null {
  if (em?.mugProductId) return { type: "catalog", productId: em.mugProductId };
  const s = parseMugProductSnapshot(em?.mugProductSnapshot ?? null);
  if (s?.isOther) return { type: "other" };
  if (s?.id) return { type: "catalog", productId: s.id };
  return null;
}

function initialNotebookSelection(
  en?: EditingNotebookOrder,
): NotebookProductSelection | null {
  if (en?.notebookProductId)
    return { type: "catalog", productId: en.notebookProductId };
  const s = parseNotebookProductSnapshot(en?.notebookProductSnapshot ?? null);
  if (s?.isOther) return { type: "other" };
  if (s?.id) return { type: "catalog", productId: s.id };
  return null;
}

export default function EditOrderLayoutModal({
  t,
  onClose,
  onUpdated,
  editingMug,
  editingNotebook,
}: {
  t: ReturnType<typeof useLanguageStore.getState>["t"];
  onClose: () => void;
  onUpdated: () => void;
  editingMug?: EditingMugOrder;
  editingNotebook?: EditingNotebookOrder;
}) {
  const { updateOrder } = useOrdersStore();

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (!editingMug && !editingNotebook) {
    // Defensive: should never render without an editing target.
    return null;
  }

  return editingMug ? (
    <MugEditModalContent
      t={t}
      onClose={onClose}
      onUpdated={onUpdated}
      editingMug={editingMug}
      updateOrder={updateOrder}
    />
  ) : editingNotebook ? (
    <NotebookEditModalContent
      t={t}
      onClose={onClose}
      onUpdated={onUpdated}
      editingNotebook={editingNotebook}
      updateOrder={updateOrder}
    />
  ) : null;
}

// ----------------------------------------------------------------------------
// Mug edit
// ----------------------------------------------------------------------------

function MugEditModalContent({
  t,
  onClose,
  onUpdated,
  editingMug,
  updateOrder,
}: {
  t: ReturnType<typeof useLanguageStore.getState>["t"];
  onClose: () => void;
  onUpdated: () => void;
  editingMug: EditingMugOrder;
  updateOrder: ReturnType<typeof useOrdersStore.getState>["updateOrder"];
}) {
  const initTemplate =
    getTemplateById(editingMug.mugLayoutData.templateId) ?? MUG_TEMPLATES[0]!;
  const initialMode: "editor" | "upload" =
    inferMugOrderUiMode(editingMug.mugLayoutData) === "upload_ready"
      ? "upload"
      : "editor";

  const [mugValue, setMugValue] = useState<MugFormValue>({
    mode: initialMode,
    template: initTemplate,
    photos: (editingMug.mugLayoutData.photoUrls ?? []).map(resolveR2Key),
    photoSettings: editingMug.mugLayoutData.photoSettings ?? [],
    text: editingMug.mugLayoutData.text ?? "",
    fontFamily: editingMug.mugLayoutData.fontFamily ?? "Roboto",
    textColor: editingMug.mugLayoutData.textColor ?? "#000000",
    backgroundColor: editingMug.mugLayoutData.backgroundColor ?? "transparent",
    selection: initialMugSelection(editingMug),
    customLayoutFile: null,
    customLayoutUrl:
      initialMode === "upload" && editingMug.existingLayoutPreviewUrl
        ? editingMug.existingLayoutPreviewUrl
        : null,
    copiesStr: String(editingMug.layoutCopies ?? 1),
  });

  const [customer, setCustomer] = useState<CustomerFormValue>({
    phone: editingMug.phone ?? "",
    clientName: editingMug.clientName ?? "",
    notes: editingMug.notes ?? "",
    priceStr: editingMug.price != null ? String(editingMug.price) : "",
    selectedClient: editingMug.studioClient ?? null,
  });

  const [productItems, setProductItems] = useState<MugProductOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const formRef = useRef<MugOrderFormHandle>(null);
  // Validation only kicks in when a NEW file is picked (existing R2 URL is
  // trusted — it was accepted at order creation time).
  const [uploadValidation, setUploadValidation] =
    useState<SizeValidationResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/mug-products")
      .then((res) => res.json())
      .then((data: { items?: MugProductOption[] }) => {
        if (!cancelled) setProductItems(data.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setProductItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-resolve the mug selection once the catalog finishes loading. While the
  // list is empty we MUST NOT clobber the editing snapshot — that used to
  // silently switch the order to «Other» before the real catalog landed.
  useEffect(() => {
    if (productItems.length === 0) return;
    setMugValue((prev) => {
      const desired = initialMugSelection(editingMug);
      if (desired?.type === "catalog") {
        const inList = productItems.some((x) => x.id === desired.productId);
        if (inList) {
          return {
            ...prev,
            selection: { type: "catalog", productId: desired.productId },
          };
        }
      }
      const snap = parseMugProductSnapshot(editingMug.mugProductSnapshot ?? null);
      if (desired?.type === "other" || snap?.isOther === true) {
        return { ...prev, selection: { type: "other" } };
      }
      if (!prev.selection) {
        return {
          ...prev,
          selection: { type: "catalog", productId: productItems[0]!.id },
        };
      }
      if (prev.selection.type === "catalog") {
        const sel = prev.selection;
        const still = productItems.some((i) => i.id === sel.productId);
        if (!still) {
          return {
            ...prev,
            selection: { type: "catalog", productId: productItems[0]!.id },
          };
        }
      }
      return prev;
    });
  }, [productItems, editingMug]);

  const mugChosen = useMemo(() => {
    const sel = mugValue.selection;
    return (
      !!sel &&
      (sel.type === "other" ||
        (sel.type === "catalog" && !!sel.productId))
    );
  }, [mugValue.selection]);

  const canSubmit = useMemo(() => {
    if (!mugChosen || customer.phone.length < 8 || submitting) return false;
    if (parseAdminCopiesInput(mugValue.copiesStr) === null) return false;
    if (mugValue.mode === "upload") {
      const hasLayout =
        !!mugValue.customLayoutFile || !!mugValue.customLayoutUrl;
      if (!hasLayout) return false;
      // New file must pass dimension check; existing R2 URL is exempt because
      // there's no `customLayoutFile` to validate.
      if (uploadValidation && !uploadValidation.ok) return false;
      return true;
    }
    return mugValue.photos.length > 0;
  }, [mugChosen, customer.phone, submitting, mugValue, uploadValidation]);

  async function handleSubmit(): Promise<void> {
    setSubmitting(true);
    setError("");
    try {
      const mugOther = mugValue.selection?.type === "other";
      const mugCatId =
        mugValue.selection?.type === "catalog"
          ? mugValue.selection.productId
          : null;

      let mugFile: File;
      let mugLayoutData: MugLayoutData | undefined;

      if (mugValue.mode === "upload") {
        if (mugValue.customLayoutFile) {
          mugFile = mugValue.customLayoutFile;
        } else if (
          inferMugOrderUiMode(editingMug.mugLayoutData) === "upload_ready" &&
          editingMug.existingLayoutPreviewUrl
        ) {
          const res = await fetch(editingMug.existingLayoutPreviewUrl, {
            credentials: "same-origin",
          });
          if (!res.ok) throw new Error("Failed to load existing layout");
          const blob = await res.blob();
          mugFile = new File(
            [blob],
            editingMug.existingLayoutFileName ?? "mug-layout.png",
            { type: blob.type || "image/png" },
          );
        } else {
          throw new Error("No layout file");
        }
        mugLayoutData = {
          templateId: "text_photo",
          text: "",
          fontFamily: "Roboto",
          textColor: "#000000",
          backgroundColor: "transparent",
          photoUrls: [],
          photoSettings: [],
        };
      } else {
        const canvas = formRef.current?.getCanvas();
        if (!canvas) throw new Error("Canvas not available");
        const photoFileKeys = await Promise.all(
          mugValue.photos.map(uploadPhotoUrl),
        );
        mugLayoutData = {
          templateId: mugValue.template.id,
          text: mugValue.text,
          fontFamily: mugValue.fontFamily,
          textColor: mugValue.textColor,
          backgroundColor: mugValue.backgroundColor,
          photoUrls: photoFileKeys,
          photoSettings: mugValue.photoSettings,
        };
        const blob = await exportCanvasAsBlob(canvas);
        mugFile = blobToFile(blob, `mug-layout-${Date.now()}.png`);
      }

      const { fileName, fileUrl } = await uploadFile(mugFile);

      const copies = parseAdminCopiesInput(mugValue.copiesStr);
      if (copies === null) throw new Error("Invalid copies");

      const layoutRes = await fetch(
        `/api/admin/orders/${editingMug.orderId}/mug-layout`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mugLayoutData: mugLayoutData ?? null,
            fileUrl,
            fileName,
            mugOther,
            mugProductId: mugCatId ?? undefined,
            copies,
          }),
        },
      );
      if (!layoutRes.ok) throw new Error("Failed to update layout");

      const priceVal = customer.priceStr.trim()
        ? parseInt(customer.priceStr, 10)
        : null;
      await updateOrder(editingMug.orderId, {
        phone: customer.phone,
        clientName: customer.clientName.trim() || null,
        clientId: customer.selectedClient?.id ?? null,
        notes: customer.notes.trim() || null,
        price: Number.isFinite(priceVal) && priceVal! >= 0 ? priceVal : null,
      });

      onUpdated();
    } catch (err) {
      if (err instanceof InsufficientStockOrderError) {
        setError(t.admin.orderStockInsufficient(err.requested, err.available));
      } else {
        setError(err instanceof Error ? err.message : "Failed to update order");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell title={t.approve.editMugLayout} onClose={onClose}>
      <MugOrderForm
        ref={formRef}
        value={mugValue}
        onChange={setMugValue}
        productItems={productItems}
        t={t}
        onUploadValidationChange={setUploadValidation}
      />

      <div className="mt-6">
        <AdminCustomerForm value={customer} onChange={setCustomer} t={t} />
      </div>

      {error && <p className="mt-4 text-sm text-red-500 text-center">{error}</p>}

      <Button
        onClick={handleSubmit}
        className="mt-6 w-full"
        size="lg"
        disabled={!canSubmit}
      >
        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {submitting ? t.admin.creatingOrder : t.admin.save}
      </Button>
    </ModalShell>
  );
}

// ----------------------------------------------------------------------------
// Notebook edit
// ----------------------------------------------------------------------------

function NotebookEditModalContent({
  t,
  onClose,
  onUpdated,
  editingNotebook,
  updateOrder,
}: {
  t: ReturnType<typeof useLanguageStore.getState>["t"];
  onClose: () => void;
  onUpdated: () => void;
  editingNotebook: EditingNotebookOrder;
  updateOrder: ReturnType<typeof useOrdersStore.getState>["updateOrder"];
}) {
  const initTemplate =
    getNotebookTemplateById(editingNotebook.notebookLayoutData.templateId) ??
    NOTEBOOK_TEMPLATES[0]!;
  const initialMode: "editor" | "upload" =
    inferNotebookOrderUiMode(editingNotebook.notebookLayoutData) ===
    "upload_ready"
      ? "upload"
      : "editor";

  const [notebookValue, setNotebookValue] = useState<NotebookFormValue>({
    mode: initialMode,
    template: initTemplate,
    photos: (editingNotebook.notebookLayoutData.photoUrls ?? []).map(
      resolveR2Key,
    ),
    photoSettings: editingNotebook.notebookLayoutData.photoSettings ?? [],
    text: editingNotebook.notebookLayoutData.text ?? "",
    fontFamily: editingNotebook.notebookLayoutData.fontFamily ?? "Roboto",
    textColor: editingNotebook.notebookLayoutData.textColor ?? "#000000",
    backgroundColor:
      editingNotebook.notebookLayoutData.backgroundColor ?? "transparent",
    selection: initialNotebookSelection(editingNotebook),
    customLayoutFile: null,
    customLayoutUrl:
      initialMode === "upload" && editingNotebook.existingLayoutPreviewUrl
        ? editingNotebook.existingLayoutPreviewUrl
        : null,
    copiesStr: String(editingNotebook.layoutCopies ?? 1),
  });

  const [customer, setCustomer] = useState<CustomerFormValue>({
    phone: editingNotebook.phone ?? "",
    clientName: editingNotebook.clientName ?? "",
    notes: editingNotebook.notes ?? "",
    priceStr:
      editingNotebook.price != null ? String(editingNotebook.price) : "",
    selectedClient: editingNotebook.studioClient ?? null,
  });

  const [productItems, setProductItems] = useState<NotebookProductOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const formRef = useRef<NotebookOrderFormHandle>(null);
  // See mug section for rationale: existing R2 URL is exempt from validation,
  // only freshly chosen files get checked against the SKU's print size.
  const [uploadValidation, setUploadValidation] =
    useState<SizeValidationResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/notebook-products")
      .then((res) => res.json())
      .then((data: { items?: NotebookProductOption[] }) => {
        if (!cancelled) setProductItems(data.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setProductItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (productItems.length === 0) return;
    setNotebookValue((prev) => {
      const desired = initialNotebookSelection(editingNotebook);
      if (desired?.type === "catalog") {
        const inList = productItems.some((x) => x.id === desired.productId);
        if (inList) {
          return {
            ...prev,
            selection: { type: "catalog", productId: desired.productId },
          };
        }
      }
      const snap = parseNotebookProductSnapshot(
        editingNotebook.notebookProductSnapshot ?? null,
      );
      if (desired?.type === "other" || snap?.isOther === true) {
        return { ...prev, selection: { type: "other" } };
      }
      if (!prev.selection) {
        return {
          ...prev,
          selection: { type: "catalog", productId: productItems[0]!.id },
        };
      }
      if (prev.selection.type === "catalog") {
        const sel = prev.selection;
        const still = productItems.some((i) => i.id === sel.productId);
        if (!still) {
          return {
            ...prev,
            selection: { type: "catalog", productId: productItems[0]!.id },
          };
        }
      }
      return prev;
    });
  }, [productItems, editingNotebook]);

  const notebookChosen = useMemo(() => {
    const sel = notebookValue.selection;
    return (
      !!sel &&
      (sel.type === "other" ||
        (sel.type === "catalog" && !!sel.productId))
    );
  }, [notebookValue.selection]);

  const canSubmit = useMemo(() => {
    if (!notebookChosen || customer.phone.length < 8 || submitting) return false;
    if (parseAdminCopiesInput(notebookValue.copiesStr) === null) return false;
    if (notebookValue.mode === "upload") {
      const hasLayout =
        !!notebookValue.customLayoutFile || !!notebookValue.customLayoutUrl;
      if (!hasLayout) return false;
      if (uploadValidation && !uploadValidation.ok) return false;
      return true;
    }
    return notebookValue.photos.length > 0;
  }, [
    notebookChosen,
    customer.phone,
    submitting,
    notebookValue,
    uploadValidation,
  ]);

  async function handleSubmit(): Promise<void> {
    setSubmitting(true);
    setError("");
    try {
      const notebookOther = notebookValue.selection?.type === "other";
      const notebookCatId =
        notebookValue.selection?.type === "catalog"
          ? notebookValue.selection.productId
          : null;

      let notebookFile: File;
      let notebookLayoutData: NotebookLayoutData | undefined;

      if (notebookValue.mode === "upload") {
        if (notebookValue.customLayoutFile) {
          notebookFile = notebookValue.customLayoutFile;
        } else if (
          inferNotebookOrderUiMode(editingNotebook.notebookLayoutData) ===
            "upload_ready" &&
          editingNotebook.existingLayoutPreviewUrl
        ) {
          const res = await fetch(editingNotebook.existingLayoutPreviewUrl, {
            credentials: "same-origin",
          });
          if (!res.ok) throw new Error("Failed to load existing layout");
          const blob = await res.blob();
          notebookFile = new File(
            [blob],
            editingNotebook.existingLayoutFileName ?? "notebook-layout.png",
            { type: blob.type || "image/png" },
          );
        } else {
          throw new Error("No layout file");
        }
        notebookLayoutData = {
          templateId: "text_photo",
          text: "",
          fontFamily: "Roboto",
          textColor: "#000000",
          backgroundColor: "transparent",
          photoUrls: [],
          photoSettings: [],
        };
      } else {
        const canvas = formRef.current?.getCanvas();
        if (!canvas) throw new Error("Canvas not available");
        const photoFileKeys = await Promise.all(
          notebookValue.photos.map(uploadPhotoUrl),
        );
        notebookLayoutData = {
          templateId: notebookValue.template.id,
          text: notebookValue.text,
          fontFamily: notebookValue.fontFamily,
          textColor: notebookValue.textColor,
          backgroundColor: notebookValue.backgroundColor,
          photoUrls: photoFileKeys,
          photoSettings: notebookValue.photoSettings,
        };
        const blob = await exportCanvasAsBlob(canvas);
        notebookFile = blobToFile(blob, `notebook-layout-${Date.now()}.png`);
      }

      const { fileName, fileUrl } = await uploadFile(notebookFile);

      const copies = parseAdminCopiesInput(notebookValue.copiesStr);
      if (copies === null) throw new Error("Invalid copies");

      const layoutRes = await fetch(
        `/api/admin/orders/${editingNotebook.orderId}/notebook-layout`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            notebookLayoutData: notebookLayoutData ?? null,
            fileUrl,
            fileName,
            notebookOther,
            notebookProductId: notebookCatId ?? undefined,
            copies,
          }),
        },
      );
      if (!layoutRes.ok) throw new Error("Failed to update layout");

      const priceVal = customer.priceStr.trim()
        ? parseInt(customer.priceStr, 10)
        : null;
      await updateOrder(editingNotebook.orderId, {
        phone: customer.phone,
        clientName: customer.clientName.trim() || null,
        clientId: customer.selectedClient?.id ?? null,
        notes: customer.notes.trim() || null,
        price: Number.isFinite(priceVal) && priceVal! >= 0 ? priceVal : null,
      });

      onUpdated();
    } catch (err) {
      if (err instanceof InsufficientStockOrderError) {
        setError(t.admin.orderStockInsufficient(err.requested, err.available));
      } else {
        setError(err instanceof Error ? err.message : "Failed to update order");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell title={t.approve.editNotebookLayout} onClose={onClose}>
      <NotebookOrderForm
        ref={formRef}
        value={notebookValue}
        onChange={setNotebookValue}
        productItems={productItems}
        t={t}
        onUploadValidationChange={setUploadValidation}
      />

      <div className="mt-6">
        <AdminCustomerForm value={customer} onChange={setCustomer} t={t} />
      </div>

      {error && <p className="mt-4 text-sm text-red-500 text-center">{error}</p>}

      <Button
        onClick={handleSubmit}
        className="mt-6 w-full"
        size="lg"
        disabled={!canSubmit}
      >
        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {submitting ? t.admin.creatingOrder : t.admin.save}
      </Button>
    </ModalShell>
  );
}

// ----------------------------------------------------------------------------

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-6 text-gray-900 shadow-xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 text-gray-400 hover:text-gray-600"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-6 flex items-center gap-2">
          <Pencil className="h-5 w-5 text-gold" />
          <h2 className="text-lg font-bold">{title}</h2>
        </div>

        {children}
      </div>
    </div>
  );
}
