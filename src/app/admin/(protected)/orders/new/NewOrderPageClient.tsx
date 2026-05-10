"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { useOrdersStore } from "@/stores/useOrdersStore";
import { InsufficientStockOrderError } from "@/lib/orderErrors";
import { exportCanvasAsBlob, blobToFile } from "@/lib/mug/exportLayout";
import type { SizeValidationResult } from "@/lib/imageDimensions";
import type {
  MugLayoutData,
  NotebookLayoutData,
  ProductType,
} from "@/lib/validations";
import {
  ProductTypePicker,
  type ProductTypeSelection,
} from "@/app/admin/_components/ProductTypePicker";
import {
  AdminCustomerForm,
  EMPTY_CUSTOMER_VALUE,
  PaperOrderForm,
  EMPTY_PAPER_VALUE,
  parseAdminCopiesInput,
  MugOrderForm,
  EMPTY_MUG_VALUE,
  type MugOrderFormHandle,
  NotebookOrderForm,
  EMPTY_NOTEBOOK_VALUE,
  type NotebookOrderFormHandle,
  type CustomerFormValue,
  type PaperFormValue,
  type MugFormValue,
  type NotebookFormValue,
} from "@/app/admin/_components/orderForms";
import {
  uploadFile,
  uploadPhotoUrl,
} from "@/app/admin/_components/orderForms/uploadHelpers";
import type { MugProductOption } from "@/app/mug/_components/MugProductPicker";
import type { NotebookProductOption } from "@/app/notebook/_components/NotebookProductPicker";

type WizardStep = "product" | "design" | "client" | "confirm";

const STEP_ORDER: WizardStep[] = ["product", "design", "client", "confirm"];

interface NewOrderPageClientProps {
  /** Optional `?product=` query param ("paper_print" | "mug" | "notebook"). */
  initialProduct: string | null;
  /** Optional `?mode=` query param ("editor" | "upload"). Ignored for paper. */
  initialMode: string | null;
  /**
   * When set, the order POST attaches the new order to this invoice line
   * after successful creation (back-link from "Create order from invoice"
   * flow). Passed verbatim to /api/admin/orders.
   */
  fromInvoiceLineItemId?: string | null;
  /** Pre-fills the client picker (used by invoice-driven flows). */
  initialClientId?: string | null;
}

function normalizeProductId(raw: string | null): string | null {
  if (raw === "paper_print" || raw === "mug" || raw === "notebook") return raw;
  return null;
}

function normalizeMode(raw: string | null): "editor" | "upload" | null {
  if (raw === "editor" || raw === "upload") return raw;
  return null;
}

export default function NewOrderPageClient({
  initialProduct,
  initialMode,
  fromInvoiceLineItemId = null,
  initialClientId = null,
}: NewOrderPageClientProps) {
  const router = useRouter();
  const { t } = useLanguageStore();
  const { createAdminOrder } = useOrdersStore();

  const initProduct = normalizeProductId(initialProduct);
  const initMode = normalizeMode(initialMode);

  const [step, setStep] = useState<WizardStep>(() => {
    if (!initProduct) return "product";
    if (initProduct === "paper_print") return "design";
    return initMode ? "design" : "product";
  });

  const [selection, setSelection] = useState<ProductTypeSelection | null>(
    () => {
      if (!initProduct) return null;
      if (initProduct === "paper_print") return { productId: "paper_print" };
      return initMode
        ? { productId: initProduct, mode: initMode }
        : { productId: initProduct };
    },
  );

  const [paperValue, setPaperValue] = useState<PaperFormValue>(EMPTY_PAPER_VALUE);
  const [mugValue, setMugValue] = useState<MugFormValue>({
    ...EMPTY_MUG_VALUE,
    mode: initMode === "upload" ? "upload" : "editor",
  });
  const [notebookValue, setNotebookValue] = useState<NotebookFormValue>({
    ...EMPTY_NOTEBOOK_VALUE,
    mode: initMode === "upload" ? "upload" : "editor",
  });
  const [customer, setCustomer] = useState<CustomerFormValue>(EMPTY_CUSTOMER_VALUE);

  // When invoked from "Create order from invoice line", fetch the linked
  // client and pre-populate the customer block (skipping the picker step).
  useEffect(() => {
    if (!initialClientId) return;
    let cancelled = false;
    fetch(`/api/admin/clients/${initialClientId}`)
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const c = (await res.json()) as {
          id: string;
          kind: string;
          phone: string | null;
          personName: string | null;
          companyName: string | null;
          companyIdno: string | null;
          companyIban: string | null;
        };
        setCustomer((prev) => {
          if (prev.selectedClient?.id === c.id) return prev;
          const nm =
            c.kind === "LEGAL"
              ? c.companyName && c.personName
                ? `${c.companyName} — ${c.personName}`
                : c.companyName || c.personName || ""
              : c.personName || "";
          return {
            ...prev,
            selectedClient: c,
            phone: c.phone ?? prev.phone,
            clientName: nm || prev.clientName,
          };
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initialClientId]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const mugFormRef = useRef<MugOrderFormHandle>(null);
  const notebookFormRef = useRef<NotebookOrderFormHandle>(null);

  // Lifted from the form children so the "Next" button reactively disables
  // when the uploaded layout's pixel size doesn't match the chosen SKU.
  // null = no validation (no file, "Other" product, or read failure).
  const [mugUploadValidation, setMugUploadValidation] =
    useState<SizeValidationResult | null>(null);
  const [notebookUploadValidation, setNotebookUploadValidation] =
    useState<SizeValidationResult | null>(null);

  // ---- Catalog loading (shared with public flows) ----
  const [mugProductItems, setMugProductItems] = useState<MugProductOption[]>([]);
  const [notebookProductItems, setNotebookProductItems] = useState<
    NotebookProductOption[]
  >([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/mug-products")
      .then((res) => res.json())
      .then((data: { items?: MugProductOption[] }) => {
        if (!cancelled) setMugProductItems(data.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setMugProductItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/notebook-products")
      .then((res) => res.json())
      .then((data: { items?: NotebookProductOption[] }) => {
        if (!cancelled) setNotebookProductItems(data.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setNotebookProductItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-select default mug/notebook when catalog loads (mirrors modal behavior).
  useEffect(() => {
    if (selection?.productId !== "mug") return;
    setMugValue((prev) => {
      if (prev.selection?.type === "catalog" || prev.selection?.type === "other") {
        return prev;
      }
      if (mugProductItems.length === 0) {
        return { ...prev, selection: { type: "other" } };
      }
      return {
        ...prev,
        selection: { type: "catalog", productId: mugProductItems[0]!.id },
      };
    });
  }, [mugProductItems, selection?.productId]);

  useEffect(() => {
    if (selection?.productId !== "notebook") return;
    setNotebookValue((prev) => {
      if (prev.selection?.type === "catalog" || prev.selection?.type === "other") {
        return prev;
      }
      if (notebookProductItems.length === 0) {
        return { ...prev, selection: { type: "other" } };
      }
      return {
        ...prev,
        selection: {
          type: "catalog",
          productId: notebookProductItems[0]!.id,
        },
      };
    });
  }, [notebookProductItems, selection?.productId]);

  // Keep per-product mode in sync with the picker selection.
  useEffect(() => {
    if (selection?.productId === "mug" && selection.mode) {
      setMugValue((prev) =>
        prev.mode === selection.mode ? prev : { ...prev, mode: selection.mode! },
      );
    }
    if (selection?.productId === "notebook" && selection.mode) {
      setNotebookValue((prev) =>
        prev.mode === selection.mode ? prev : { ...prev, mode: selection.mode! },
      );
    }
  }, [selection]);

  // ---- Step navigation ----
  const productType: ProductType | null = useMemo(() => {
    if (!selection) return null;
    if (selection.productId === "mug") return "mug";
    if (selection.productId === "notebook") return "notebook";
    if (selection.productId === "paper_print") return "paper_print";
    return null;
  }, [selection]);

  const stepIndex = STEP_ORDER.indexOf(step);
  const totalSteps = STEP_ORDER.length;

  const productPickedAndComplete = useMemo(() => {
    if (!selection) return false;
    if (selection.productId === "paper_print") return true;
    return selection.mode != null;
  }, [selection]);

  function canAdvance(): boolean {
    if (step === "product") return productPickedAndComplete;
    if (step === "design") {
      if (productType === "paper_print") {
        return (
          paperValue.files.length > 0 &&
          parseAdminCopiesInput(paperValue.copiesStr) !== null
        );
      }
      if (productType === "mug") {
        const chosen =
          mugValue.selection != null &&
          (mugValue.selection.type === "other" ||
            (mugValue.selection.type === "catalog" &&
              !!mugValue.selection.productId));
        if (!chosen) return false;
        if (mugValue.mode === "upload") {
          if (mugValue.customLayoutFile == null) return false;
          // Block "Next" while the uploaded layout doesn't match the SKU's
          // expected pixel size. "Other" mugs short-circuit (validation = null).
          if (mugUploadValidation && !mugUploadValidation.ok) return false;
          return true;
        }
        return mugValue.photos.length > 0;
      }
      if (productType === "notebook") {
        const chosen =
          notebookValue.selection != null &&
          (notebookValue.selection.type === "other" ||
            (notebookValue.selection.type === "catalog" &&
              !!notebookValue.selection.productId));
        if (!chosen) return false;
        if (notebookValue.mode === "upload") {
          if (notebookValue.customLayoutFile == null) return false;
          if (notebookUploadValidation && !notebookUploadValidation.ok)
            return false;
          return true;
        }
        return notebookValue.photos.length > 0;
      }
      return false;
    }
    if (step === "client") return customer.phone.length >= 8;
    return true;
  }

  function goNext(): void {
    const idx = STEP_ORDER.indexOf(step);
    if (idx < STEP_ORDER.length - 1) {
      setStep(STEP_ORDER[idx + 1]!);
    }
  }

  function goBack(): void {
    const idx = STEP_ORDER.indexOf(step);
    if (idx > 0) setStep(STEP_ORDER[idx - 1]!);
  }

  function handleProductPick(sel: ProductTypeSelection): void {
    setSelection(sel);
    if (sel.productId === "paper_print") {
      setStep("design");
    } else if (sel.mode) {
      setStep("design");
    }
  }

  // ---- Submit ----
  async function handleSubmit(): Promise<void> {
    if (!productType) return;
    // Belt-and-braces: server-side validation lives in the catalog form, but
    // the user could in theory reach this point if a SKU is changed after the
    // file was uploaded. Refuse early with a friendly error.
    if (
      productType === "mug" &&
      mugValue.mode === "upload" &&
      mugUploadValidation &&
      !mugUploadValidation.ok
    ) {
      setError(
        t.admin.layoutValidation.sizeMismatch(
          mugUploadValidation.expected.width,
          mugUploadValidation.expected.height,
          mugUploadValidation.actual.width,
          mugUploadValidation.actual.height,
        ),
      );
      return;
    }
    if (
      productType === "notebook" &&
      notebookValue.mode === "upload" &&
      notebookUploadValidation &&
      !notebookUploadValidation.ok
    ) {
      setError(
        t.admin.layoutValidation.sizeMismatch(
          notebookUploadValidation.expected.width,
          notebookUploadValidation.expected.height,
          notebookUploadValidation.actual.width,
          notebookUploadValidation.actual.height,
        ),
      );
      return;
    }
    setSubmitting(true);
    setError("");

    try {
      const priceVal = customer.priceStr.trim()
        ? parseInt(customer.priceStr, 10)
        : null;
      const priceField =
        Number.isFinite(priceVal) && priceVal! >= 0 ? priceVal : undefined;

      if (productType === "mug") {
        const mugOther = mugValue.selection?.type === "other";
        const mugCatId =
          mugValue.selection?.type === "catalog"
            ? mugValue.selection.productId
            : null;

        let mugFile: File;
        let mugLayoutData: MugLayoutData | undefined;

        if (mugValue.mode === "upload") {
          if (!mugValue.customLayoutFile) throw new Error("No layout file");
          mugFile = mugValue.customLayoutFile;
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
          const canvas = mugFormRef.current?.getCanvas();
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

        await createAdminOrder({
          phone: customer.phone,
          clientName: customer.clientName.trim() || undefined,
          clientId: customer.selectedClient?.id,
          notes: customer.notes.trim() || undefined,
          price: priceField,
          productType: "mug",
          mugLayoutData,
          mugOther,
          mugProductId: mugCatId ?? undefined,
          files: [{ fileName, fileUrl, copies: 1, color: "color" }],
          fromInvoiceLineItemId: fromInvoiceLineItemId ?? undefined,
        });
      } else if (productType === "notebook") {
        const notebookOther = notebookValue.selection?.type === "other";
        const notebookCatId =
          notebookValue.selection?.type === "catalog"
            ? notebookValue.selection.productId
            : null;

        let notebookFile: File;
        let notebookLayoutData: NotebookLayoutData | undefined;

        if (notebookValue.mode === "upload") {
          if (!notebookValue.customLayoutFile)
            throw new Error("No layout file");
          notebookFile = notebookValue.customLayoutFile;
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
          const canvas = notebookFormRef.current?.getCanvas();
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

        await createAdminOrder({
          phone: customer.phone,
          clientName: customer.clientName.trim() || undefined,
          clientId: customer.selectedClient?.id,
          notes: customer.notes.trim() || undefined,
          price: priceField,
          productType: "notebook",
          notebookLayoutData,
          notebookOther,
          notebookProductId: notebookCatId ?? undefined,
          files: [{ fileName, fileUrl, copies: 1, color: "color" }],
          fromInvoiceLineItemId: fromInvoiceLineItemId ?? undefined,
        });
      } else {
        const copies = parseAdminCopiesInput(paperValue.copiesStr);
        if (paperValue.files.length === 0 || copies === null)
          throw new Error("Invalid file list / copies");

        const fileData = await Promise.all(
          paperValue.files.map(async (entry) => {
            const { fileName, fileUrl } = await uploadFile(entry.file);
            const resolvedPaper =
              paperValue.paperType === "other" &&
              paperValue.customWidth.trim() &&
              paperValue.customHeight.trim()
                ? `other:${paperValue.customWidth.trim()}x${paperValue.customHeight.trim()}`
                : paperValue.paperType;
            return {
              fileName,
              fileUrl,
              copies,
              color: paperValue.color,
              paperType: resolvedPaper,
              pageCount: entry.pageCount,
            };
          }),
        );

        await createAdminOrder({
          phone: customer.phone,
          clientName: customer.clientName.trim() || undefined,
          clientId: customer.selectedClient?.id,
          notes: customer.notes.trim() || undefined,
          price: priceField,
          productType: "paper_print",
          files: fileData,
          fromInvoiceLineItemId: fromInvoiceLineItemId ?? undefined,
        });
      }

      router.push("/admin/orders");
      router.refresh();
    } catch (err) {
      if (err instanceof InsufficientStockOrderError) {
        setError(t.admin.orderStockInsufficient(err.requested, err.available));
      } else {
        setError(err instanceof Error ? err.message : "Failed to create order");
      }
    } finally {
      setSubmitting(false);
    }
  }

  // ---- UI ----
  const stepLabels = [
    t.admin.newOrderPage.stepProductLabel,
    t.admin.newOrderPage.stepDesignLabel,
    t.admin.newOrderPage.stepClientLabel,
    t.admin.newOrderPage.stepConfirmLabel,
  ];

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:py-8 text-gray-900">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/orders"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
          >
            <ChevronLeft className="h-4 w-4" />
            {t.admin.newOrderPage.cancel}
          </Link>
          <h1 className="text-xl font-bold sm:text-2xl">
            {t.admin.newOrderPage.title}
          </h1>
        </div>
      </header>

      <StepProgress
        current={stepIndex + 1}
        total={totalSteps}
        labels={stepLabels}
        formatLine={t.admin.newOrderPage.stepIndicator}
      />

      <div className="mt-4 rounded-2xl bg-white p-4 sm:p-6 shadow-sm border border-gray-200">
        {step === "product" && (
          <ProductTypePicker
            selected={selection}
            onSelect={handleProductPick}
          />
        )}

        {step === "design" && productType === "paper_print" && (
          <PaperOrderForm value={paperValue} onChange={setPaperValue} t={t} />
        )}

        {/*
         * Mug / notebook design forms host a live <canvas> that the submit
         * step needs (`mugFormRef.current.getCanvas()` produces the layout
         * PNG). If we unmount them when the wizard moves to "client" /
         * "confirm", the ref turns null and submission fails with
         * "Canvas not available". Keep them mounted but visually hidden on
         * later steps — the bitmap stays valid and form data lives in the
         * parent so there's no extra cost.
         */}
        {productType === "mug" &&
          (step === "design" || step === "client" || step === "confirm") && (
            <div
              className={step === "design" ? undefined : "hidden"}
              aria-hidden={step !== "design"}
            >
              <MugOrderForm
                ref={mugFormRef}
                value={mugValue}
                onChange={setMugValue}
                productItems={mugProductItems}
                t={t}
                onUploadValidationChange={setMugUploadValidation}
              />
            </div>
          )}

        {productType === "notebook" &&
          (step === "design" || step === "client" || step === "confirm") && (
            <div
              className={step === "design" ? undefined : "hidden"}
              aria-hidden={step !== "design"}
            >
              <NotebookOrderForm
                ref={notebookFormRef}
                value={notebookValue}
                onChange={setNotebookValue}
                productItems={notebookProductItems}
                t={t}
                onUploadValidationChange={setNotebookUploadValidation}
              />
            </div>
          )}

        {step === "client" && (
          <AdminCustomerForm
            value={customer}
            onChange={setCustomer}
            t={t}
          />
        )}

        {step === "confirm" && (
          <ConfirmStep
            t={t}
            productType={productType}
            mode={
              productType === "mug"
                ? mugValue.mode
                : productType === "notebook"
                  ? notebookValue.mode
                  : null
            }
            customer={customer}
          />
        )}

        {error && (
          <p className="mt-4 text-sm text-red-500 text-center">{error}</p>
        )}

        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <Button variant="outline" onClick={goBack} disabled={submitting}>
                {t.admin.newOrderPage.back}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step !== "confirm" ? (
              <Button onClick={goNext} disabled={!canAdvance() || submitting}>
                {t.admin.newOrderPage.next}
              </Button>
            ) : (
              <Button
                size="lg"
                onClick={handleSubmit}
                disabled={!canAdvance() || submitting}
              >
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {submitting ? t.admin.creatingOrder : t.admin.createOrder}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StepProgress({
  current,
  total,
  labels,
  formatLine,
}: {
  current: number;
  total: number;
  labels: string[];
  formatLine: (current: number, total: number) => string;
}) {
  const pct = total > 0 ? (current / total) * 100 : 0;
  const stepName = labels[current - 1] ?? "";
  const line = `${formatLine(current, total)} — ${stepName}`;

  return (
    <div className="space-y-2">
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200"
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-label={line}
      >
        <div
          className="h-full rounded-full bg-gold transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p
        className="text-center text-[11px] sm:text-xs text-gray-600"
        aria-live="polite"
      >
        {line}
      </p>
    </div>
  );
}

function ConfirmStep({
  t,
  productType,
  mode,
  customer,
}: {
  t: ReturnType<typeof useLanguageStore.getState>["t"];
  productType: ProductType | null;
  mode: "editor" | "upload" | null;
  customer: CustomerFormValue;
}) {
  const productLabel =
    productType === "paper_print"
      ? t.mug.productPaperPrint
      : productType === "mug"
        ? t.mug.productMug
        : productType === "notebook"
          ? t.notebook.productNotebook
          : "—";
  const modeLabel =
    productType === "mug" && mode
      ? mode === "editor"
        ? t.mug.mugModeEditor
        : t.mug.mugModeUpload
      : productType === "notebook" && mode
        ? mode === "editor"
          ? t.notebook.notebookModeEditor
          : t.notebook.notebookModeUpload
        : null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900">
          {t.admin.newOrderPage.confirmTitle}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          {t.admin.newOrderPage.confirmHint}
        </p>
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-gray-200 p-4">
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-400">
            {t.admin.newOrderPage.stepProductLabel}
          </dt>
          <dd className="mt-1 text-sm font-medium text-gray-800">
            {productLabel}
            {modeLabel ? ` — ${modeLabel}` : null}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-400">
            {t.common.phone}
          </dt>
          <dd className="mt-1 text-sm font-medium text-gray-800">
            {customer.phone || "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-400">
            {t.admin.clientName}
          </dt>
          <dd className="mt-1 text-sm font-medium text-gray-800">
            {customer.clientName || "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-400">
            {t.admin.price} ({t.admin.currency})
          </dt>
          <dd className="mt-1 text-sm font-medium text-gray-800">
            {customer.priceStr || "—"}
          </dd>
        </div>
        {customer.notes && (
          <div className="sm:col-span-2">
            <dt className="text-xs uppercase tracking-wide text-gray-400">
              {t.upload.notesLabel}
            </dt>
            <dd className="mt-1 text-sm whitespace-pre-line text-gray-800">
              {customer.notes}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}
