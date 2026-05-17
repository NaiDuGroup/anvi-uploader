"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  Coffee,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Send,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { exportCanvasAsBlob, blobToFile } from "@/lib/mug/exportLayout";
import type { SizeValidationResult } from "@/lib/imageDimensions";
import type {
  MugLayoutData,
  NotebookLayoutData,
  ProductType,
} from "@/lib/validations";
import {
  PaperOrderForm,
  EMPTY_PAPER_VALUE,
  parseAdminCopiesInput,
  MugOrderForm,
  EMPTY_MUG_VALUE,
  type MugOrderFormHandle,
  NotebookOrderForm,
  EMPTY_NOTEBOOK_VALUE,
  type NotebookOrderFormHandle,
  type PaperFormValue,
  type MugFormValue,
  type NotebookFormValue,
} from "@/app/admin/_components/orderForms";
import {
  uploadFile,
  uploadPhotoUrl,
} from "@/app/admin/_components/orderForms/uploadHelpers";
import type {
  MugProductOption,
  MugProductSelection,
} from "@/app/mug/_components/MugProductPicker";
import type {
  NotebookProductOption,
  NotebookProductSelection,
} from "@/app/notebook/_components/NotebookProductPicker";
import { mugProductDisplayName } from "@/lib/mug/mugProductLabels";
import { notebookProductDisplayName } from "@/lib/notebook/notebookProductLabels";
import { NotebookPaperKindBadge } from "@/app/notebook/_components/NotebookPaperKindBadge";
import { cn } from "@/lib/utils";

export interface CabinetViewer {
  /** Studio customer's display name. */
  displayName: string;
  /** Studio customer's normalised phone (read-only). */
  phone: string;
  /** "Dealer" pill controls only — the actual price is resolved server-side. */
  isDealer: boolean;
  /** Initials shown in the avatar circle. */
  initials: string;
}

type TabConfig = {
  id: ProductType;
  Icon: LucideIcon;
  /** Translation accessor for the tab label. */
  label: keyof CabinetNewOrderTranslations;
};

type CabinetNewOrderTranslations = {
  tabPaper: string;
  tabMug: string;
  tabNotebook: string;
};

const TABS: TabConfig[] = [
  { id: "paper_print", Icon: FileText, label: "tabPaper" },
  { id: "mug", Icon: Coffee, label: "tabMug" },
  { id: "notebook", Icon: BookOpen, label: "tabNotebook" },
];

type SubmitFailure = { kind: "generic"; message: string };

/**
 * Wide single-page order builder for the customer cabinet.
 *
 * Replaces the old 3-card chooser that delegated to the public mobile
 * wizards. Dealers asked for an admin-style flow: every field on one screen,
 * full-width canvas, no step-by-step. We reuse the admin form components
 * (`PaperOrderForm`, `MugOrderForm`, `NotebookOrderForm`) but skip the
 * customer picker — the logged-in customer's identity is authoritative and
 * pinned in a banner above the form. Submission goes through
 * `POST /api/orders` (session-aware: phone, client and price are resolved
 * server-side from the cabinet session).
 */
export default function CabinetNewOrderClient({
  viewer,
}: {
  viewer: CabinetViewer;
}) {
  const router = useRouter();
  const { t } = useLanguageStore();

  const [productType, setProductType] = useState<ProductType>("paper_print");
  const [paperValue, setPaperValue] = useState<PaperFormValue>(EMPTY_PAPER_VALUE);
  // Dealers mostly upload ready-made layouts, so the cabinet form defaults to
  // the upload mode for both mug and notebook. The toggle still lets a user
  // switch into the editor when they want to compose something fresh.
  const [mugValue, setMugValue] = useState<MugFormValue>({
    ...EMPTY_MUG_VALUE,
    mode: "upload",
  });
  const [notebookValue, setNotebookValue] = useState<NotebookFormValue>({
    ...EMPTY_NOTEBOOK_VALUE,
    mode: "upload",
  });
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<SubmitFailure | null>(null);

  const mugFormRef = useRef<MugOrderFormHandle>(null);
  const notebookFormRef = useRef<NotebookOrderFormHandle>(null);

  // The wrapping <div>s for the upload/editor block. We smooth-scroll them
  // into view on SKU change so users on screens narrower than `xl`
  // (= no side-by-side layout) see the upload zone immediately after picking
  // a mug/notebook — earlier feedback was "ничего не происходит when I click
  // a mug". On `xl+` the form is already visible to the right of the picker
  // and `block: "nearest"` makes the call a no-op.
  const mugFormScrollRef = useRef<HTMLDivElement | null>(null);
  const notebookFormScrollRef = useRef<HTMLDivElement | null>(null);
  const previousMugSelectionRef = useRef<MugFormValue["selection"]>(null);
  const previousNotebookSelectionRef = useRef<NotebookFormValue["selection"]>(
    null,
  );

  // Lifted from the form children so submit can refuse a mismatched layout.
  const [mugUploadValidation, setMugUploadValidation] =
    useState<SizeValidationResult | null>(null);
  const [notebookUploadValidation, setNotebookUploadValidation] =
    useState<SizeValidationResult | null>(null);

  // Catalogs for mug + notebook pickers. The endpoints are session-aware so
  // the dealer/retail price the picker shows already matches this viewer.
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

  // Auto-select first SKU once the catalog loads (mirrors admin behaviour).
  useEffect(() => {
    if (productType !== "mug") return;
    setMugValue((prev) => {
      if (
        prev.selection?.type === "catalog" ||
        prev.selection?.type === "other"
      ) {
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
  }, [mugProductItems, productType]);

  useEffect(() => {
    if (productType !== "notebook") return;
    setNotebookValue((prev) => {
      if (
        prev.selection?.type === "catalog" ||
        prev.selection?.type === "other"
      ) {
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
  }, [notebookProductItems, productType]);

  // Smooth-scroll the upload/editor block into view whenever the user picks
  // a different SKU. We compare against the previous selection so the
  // initial auto-pick (above) doesn't yank the page on first render. On
  // `xl+` the form sits beside the picker and `block: "nearest"` skips the
  // scroll because the target is already visible.
  useEffect(() => {
    if (productType !== "mug") return;
    if (previousMugSelectionRef.current === mugValue.selection) return;
    const isFirst = previousMugSelectionRef.current === null;
    previousMugSelectionRef.current = mugValue.selection;
    if (isFirst) return;
    if (mugValue.selection == null) return;
    mugFormScrollRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [mugValue.selection, productType]);

  useEffect(() => {
    if (productType !== "notebook") return;
    if (previousNotebookSelectionRef.current === notebookValue.selection)
      return;
    const isFirst = previousNotebookSelectionRef.current === null;
    previousNotebookSelectionRef.current = notebookValue.selection;
    if (isFirst) return;
    if (notebookValue.selection == null) return;
    notebookFormScrollRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [notebookValue.selection, productType]);

  const canSubmit = useMemo<boolean>(() => {
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
      if (parseAdminCopiesInput(mugValue.copiesStr) === null) return false;
      if (mugValue.mode === "upload") {
        if (mugValue.customLayoutFile == null) return false;
        if (mugUploadValidation && !mugUploadValidation.ok) return false;
        return true;
      }
      return mugValue.photos.length > 0;
    }
    // notebook
    const chosen =
      notebookValue.selection != null &&
      (notebookValue.selection.type === "other" ||
        (notebookValue.selection.type === "catalog" &&
          !!notebookValue.selection.productId));
    if (!chosen) return false;
    if (parseAdminCopiesInput(notebookValue.copiesStr) === null) return false;
    if (notebookValue.mode === "upload") {
      if (notebookValue.customLayoutFile == null) return false;
      if (notebookUploadValidation && !notebookUploadValidation.ok) return false;
      return true;
    }
    return notebookValue.photos.length > 0;
  }, [
    productType,
    paperValue,
    mugValue,
    notebookValue,
    mugUploadValidation,
    notebookUploadValidation,
  ]);

  async function handleSubmit(): Promise<void> {
    if (submitting || !canSubmit) return;
    setFailure(null);
    setSubmitting(true);

    try {
      let payload: Record<string, unknown>;

      if (productType === "mug") {
        const mugCopies = parseAdminCopiesInput(mugValue.copiesStr);
        if (mugCopies === null) throw new Error("Invalid copies");

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

        payload = {
          notes: notes.trim() || undefined,
          productType: "mug",
          mugLayoutData,
          mugOther,
          ...(mugCatId ? { mugProductId: mugCatId } : {}),
          files: [{ fileName, fileUrl, copies: mugCopies, color: "color" }],
        };
      } else if (productType === "notebook") {
        const notebookCopies = parseAdminCopiesInput(notebookValue.copiesStr);
        if (notebookCopies === null) throw new Error("Invalid copies");

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
          notebookFile = blobToFile(
            blob,
            `notebook-layout-${Date.now()}.png`,
          );
        }

        const { fileName, fileUrl } = await uploadFile(notebookFile);

        payload = {
          notes: notes.trim() || undefined,
          productType: "notebook",
          notebookLayoutData,
          notebookOther,
          ...(notebookCatId ? { notebookProductId: notebookCatId } : {}),
          files: [{ fileName, fileUrl, copies: notebookCopies, color: "color" }],
        };
      } else {
        const copies = parseAdminCopiesInput(paperValue.copiesStr);
        if (paperValue.files.length === 0 || copies === null) {
          throw new Error("Invalid file list / copies");
        }
        const fileData = await Promise.all(
          paperValue.files.map(async (entry) => {
            const upload = await uploadFile(entry.file);
            const resolvedPaper =
              paperValue.paperType === "other" &&
              paperValue.customWidth.trim() &&
              paperValue.customHeight.trim()
                ? `other:${paperValue.customWidth.trim()}x${paperValue.customHeight.trim()}`
                : paperValue.paperType;
            return {
              fileName: upload.fileName,
              fileUrl: upload.fileUrl,
              copies,
              color: paperValue.color,
              paperType: resolvedPaper,
              pageCount: entry.pageCount,
            };
          }),
        );

        payload = {
          notes: notes.trim() || undefined,
          productType: "paper_print",
          files: fileData,
        };
      }

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setFailure({
          kind: "generic",
          message: body.error ?? t.cabinet.newOrder.submitFailed,
        });
        return;
      }

      const created = (await res.json()) as { id: string };
      router.push(`/cabinet/orders/${created.id}`);
      router.refresh();
    } catch (err) {
      setFailure({
        kind: "generic",
        message:
          err instanceof Error ? err.message : t.cabinet.newOrder.submitFailed,
      });
    } finally {
      setSubmitting(false);
    }
  }

  const tabLabels: CabinetNewOrderTranslations = {
    tabPaper: t.cabinet.newOrder.tabPaper,
    tabMug: t.cabinet.newOrder.tabMug,
    tabNotebook: t.cabinet.newOrder.tabNotebook,
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <Link
        href="/cabinet/orders"
        className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        {t.cabinet.newOrder.backToOrders}
      </Link>

      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {t.cabinet.newOrder.title}
          </h1>
          <p className="mt-1 text-sm text-gray-500 sm:text-base">
            {t.cabinet.newOrder.subtitle}
          </p>
        </div>

        <ViewerBanner viewer={viewer} sendingAs={t.cabinet.newOrder.sendingAs} />
      </header>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        {/*
          Top strip: product-type tabs (left) + a design-mode toggle on the
          right that's only meaningful for mug/notebook. Keeping the toggle
          here — out of the SKU section — answers the dealer feedback that
          the previous inline placement felt cramped.
        */}
        <div className="flex flex-col gap-2 border-b border-gray-200 bg-gray-50/60 sm:flex-row sm:items-stretch sm:gap-0">
          <Tabs
            tabs={TABS}
            active={productType}
            onSelect={setProductType}
            labels={tabLabels}
          />
          {productType === "mug" ? (
            <div className="flex items-center justify-end px-3 pb-2 sm:py-2 sm:pb-2">
              <ModeToggle
                mode={mugValue.mode}
                onChange={(mode) =>
                  setMugValue((prev) =>
                    prev.mode === mode ? prev : { ...prev, mode },
                  )
                }
                editorLabel={t.mug.mugModeEditor}
                uploadLabel={t.mug.mugModeUpload}
              />
            </div>
          ) : null}
          {productType === "notebook" ? (
            <div className="flex items-center justify-end px-3 pb-2 sm:py-2 sm:pb-2">
              <ModeToggle
                mode={notebookValue.mode}
                onChange={(mode) =>
                  setNotebookValue((prev) =>
                    prev.mode === mode ? prev : { ...prev, mode },
                  )
                }
                editorLabel={t.notebook.notebookModeEditor}
                uploadLabel={t.notebook.notebookModeUpload}
              />
            </div>
          ) : null}
        </div>

        <div className="space-y-4 p-3 sm:space-y-5 sm:p-4">
          {productType === "paper_print" && (
            <PaperOrderForm
              value={paperValue}
              onChange={setPaperValue}
              t={t}
            />
          )}

          {/*
           * Mug + notebook design forms host live <canvas> elements that the
           * submit step needs (`mugFormRef.current.getCanvas()` produces the
           * layout PNG). If we unmount them when the user switches tabs, the
           * ref turns null and submission fails. We keep them mounted but
           * visually hidden when their tab is inactive — bitmap stays valid
           * and form data lives in the parent so there's no extra cost.
           */}
          {/*
            Side-by-side layout at `xl+`: SKU picker on the left
            (~440px), upload/editor block on the right. Below `xl` the two
            blocks stack — the smooth-scroll effect above keeps the form in
            sight when a SKU is chosen on a narrow viewport.
          */}
          <div
            className={
              productType === "mug"
                ? "grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,440px)_1fr]"
                : "hidden"
            }
            aria-hidden={productType !== "mug"}
          >
            <MugSkuSection
              label={t.admin.mugProductPickLabel}
              items={mugProductItems}
              value={mugValue.selection}
              onChange={(selection) =>
                setMugValue((prev) => ({ ...prev, selection }))
              }
              otherLabel={t.admin.mugProductOtherLabel}
            />
            <div ref={mugFormScrollRef} className="min-w-0 scroll-mt-24">
              <MugOrderForm
                ref={mugFormRef}
                value={mugValue}
                onChange={setMugValue}
                productItems={mugProductItems}
                t={t}
                hideProductPicker
                singleColumn
                onUploadValidationChange={setMugUploadValidation}
              />
            </div>
          </div>

          <div
            className={
              productType === "notebook"
                ? "grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,440px)_1fr]"
                : "hidden"
            }
            aria-hidden={productType !== "notebook"}
          >
            <NotebookSkuSection
              label={t.admin.notebookProductPickLabel}
              items={notebookProductItems}
              value={notebookValue.selection}
              onChange={(selection) =>
                setNotebookValue((prev) => ({ ...prev, selection }))
              }
              otherLabel={t.admin.notebookProductOtherLabel}
            />
            <div ref={notebookFormScrollRef} className="min-w-0 scroll-mt-24">
              <NotebookOrderForm
                ref={notebookFormRef}
                value={notebookValue}
                onChange={setNotebookValue}
                productItems={notebookProductItems}
                t={t}
                hideProductPicker
                singleColumn
                onUploadValidationChange={setNotebookUploadValidation}
              />
            </div>
          </div>

          {failure ? (
            <p
              role="alert"
              className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {failure.message}
            </p>
          ) : null}

          {/* Action bar: notes (1-line input) + submit live in the same row on
              desktop so dealers don't need to scroll past a tall textarea to
              hit "Send to workshop". Stacks on mobile. */}
          <div className="flex flex-col gap-2 border-t border-gray-100 pt-3 sm:flex-row sm:items-center sm:gap-3">
            <input
              id="cabinet-order-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 500))}
              placeholder={t.cabinet.newOrder.notesPlaceholder}
              aria-label={t.cabinet.newOrder.notesLabel}
              className="h-10 flex-1 rounded-lg border border-gray-200 bg-white px-3 text-sm shadow-sm focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
            />
            <Button
              type="button"
              size="lg"
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className="sm:shrink-0"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {submitting
                ? t.cabinet.newOrder.submitting
                : t.cabinet.newOrder.submit}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Pinned customer banner — replaces the admin "client picker" step. */
function ViewerBanner({
  viewer,
  sendingAs,
}: {
  viewer: CabinetViewer;
  sendingAs: (name: string) => string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-2.5 shadow-sm">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold/15 text-sm font-bold uppercase text-gold-dark">
        {viewer.initials}
      </span>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-xs text-gray-500">
          {sendingAs(viewer.displayName)}
        </p>
        <p className="truncate text-sm font-semibold text-gray-900">
          {viewer.phone}
        </p>
      </div>
    </div>
  );
}

/**
 * Mid-sized SKU grid section for mug products. Shaped like a self-contained
 * "section" (header + bordered card) so it visually matches the file-upload
 * block that sits below it — that was the dealer's request: "сделай чтобы
 * это была как секция загрузки". Cards are ~120px wide on desktop; the grid
 * wraps and never scrolls horizontally.
 */
function MugSkuSection({
  label,
  items,
  value,
  onChange,
  otherLabel,
}: {
  label: string;
  items: MugProductOption[];
  value: MugProductSelection | null;
  onChange: (selection: MugProductSelection) => void;
  otherLabel: string;
}) {
  const { t, locale } = useLanguageStore();
  return (
    <Section label={label}>
      {/*
        Column counts: 2 → 3 → 4 → 5 while the picker is full-width (below
        `xl`), then collapse to 2-3 cols when the cabinet outer grid
        re-renders this section in its narrower side column at `xl+`.
      */}
      <div
        role="radiogroup"
        aria-label={label}
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2.5 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-2 2xl:grid-cols-3"
      >
        {items.map((p) => {
          const selected =
            value?.type === "catalog" && value.productId === p.id;
          const name = mugProductDisplayName(p, locale);
          return (
            <SkuCard
              key={p.id}
              selected={selected}
              onClick={() =>
                onChange({ type: "catalog", productId: p.id })
              }
              imageUrl={p.imagePublicUrl}
              fallbackBg={p.bodyColorHex}
              name={name}
              price={p.sellPrice ?? null}
              currency={t.admin.currency}
            />
          );
        })}
        <OtherSkuCard
          selected={value?.type === "other"}
          onClick={() => onChange({ type: "other" })}
          label={otherLabel}
        />
      </div>
    </Section>
  );
}

/** Notebook equivalent of {@link MugSkuSection}. */
function NotebookSkuSection({
  label,
  items,
  value,
  onChange,
  otherLabel,
}: {
  label: string;
  items: NotebookProductOption[];
  value: NotebookProductSelection | null;
  onChange: (selection: NotebookProductSelection) => void;
  otherLabel: string;
}) {
  const { t, locale } = useLanguageStore();
  return (
    <Section label={label}>
      <div
        role="radiogroup"
        aria-label={label}
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2.5 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-2 2xl:grid-cols-3"
      >
        {items.map((p) => {
          const selected =
            value?.type === "catalog" && value.productId === p.id;
          const name = notebookProductDisplayName(p, locale);
          return (
            <SkuCard
              key={p.id}
              selected={selected}
              onClick={() =>
                onChange({ type: "catalog", productId: p.id })
              }
              imageUrl={p.imagePublicUrl}
              fallbackBg={p.coverColorHex}
              name={name}
              price={p.sellPrice ?? null}
              currency={t.admin.currency}
              overlay={
                <NotebookPaperKindBadge
                  kind={p.paperKind}
                  size="xs"
                  className="shadow-sm"
                />
              }
            />
          );
        })}
        <OtherSkuCard
          selected={value?.type === "other"}
          onClick={() => onChange({ type: "other" })}
          label={otherLabel}
        />
      </div>
    </Section>
  );
}

/** Bordered "card-like" wrapper with a small label, paired with the SKU grid. */
function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </h3>
      {children}
    </section>
  );
}

/**
 * Single mid-sized SKU card. Image (square thumb) + name + price.
 *
 * `overlay` is rendered absolutely positioned at the top-right of the
 * thumbnail. Notebook cards use it to surface the paper kind (lined /
 * squared / dated) so dealers can tell what's inside the cover at a glance
 * without opening the product details.
 */
function SkuCard({
  selected,
  onClick,
  imageUrl,
  fallbackBg,
  name,
  price,
  currency,
  overlay,
}: {
  selected: boolean;
  onClick: () => void;
  imageUrl: string | null;
  fallbackBg: string;
  name: string;
  price: number | null;
  currency: string;
  overlay?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      title={name}
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border-2 bg-white text-center transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold",
        selected
          ? "border-gold ring-1 ring-gold/25 shadow-sm"
          : "border-gray-200 hover:border-gray-300",
      )}
    >
      <div
        className="relative flex aspect-square items-center justify-center overflow-hidden bg-gray-50"
        style={imageUrl ? undefined : { backgroundColor: fallbackBg }}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            className="h-full w-full object-contain p-2"
          />
        ) : null}
        {overlay ? (
          <div className="pointer-events-none absolute right-1.5 top-1.5">
            {overlay}
          </div>
        ) : null}
      </div>
      <div className="flex flex-col items-center gap-0.5 px-2 py-1.5">
        <span className="line-clamp-2 text-xs font-medium leading-tight text-gray-900">
          {name}
        </span>
        {price != null ? (
          <span className="text-[11px] font-semibold tabular-nums text-gold">
            {price} {currency}
          </span>
        ) : null}
      </div>
    </button>
  );
}

/** "Other / not in catalog" card matching the {@link SkuCard} footprint. */
function OtherSkuCard({
  selected,
  onClick,
  label,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "flex aspect-[1/1.2] flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed text-center transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold",
        selected
          ? "border-gold bg-amber-50/50 text-amber-950"
          : "border-gray-300 bg-gray-50/40 text-gray-600 hover:border-amber-300 hover:bg-amber-50/30 hover:text-amber-900",
      )}
    >
      <Plus className="h-5 w-5" />
      <span className="px-2 text-[11px] font-medium leading-tight">
        {label}
      </span>
    </button>
  );
}

/**
 * Two-way segmented toggle for mug/notebook editor vs upload mode. Surfaces
 * the "ready layout" path that dealers asked for — without bringing back the
 * full ProductTypePicker wizard step.
 */
function ModeToggle({
  mode,
  onChange,
  editorLabel,
  uploadLabel,
}: {
  mode: "editor" | "upload";
  onChange: (mode: "editor" | "upload") => void;
  editorLabel: string;
  uploadLabel: string;
}) {
  return (
    <div
      role="tablist"
      aria-label="Design mode"
      className="inline-flex rounded-full border border-gray-200 bg-gray-100 p-0.5 text-sm font-medium"
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === "editor"}
        onClick={() => onChange("editor")}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 transition-colors",
          mode === "editor"
            ? "bg-white text-gray-900 shadow-sm"
            : "text-gray-600 hover:text-gray-900",
        )}
      >
        <Pencil className="h-3.5 w-3.5" />
        {editorLabel}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "upload"}
        onClick={() => onChange("upload")}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 transition-colors",
          mode === "upload"
            ? "bg-white text-gray-900 shadow-sm"
            : "text-gray-600 hover:text-gray-900",
        )}
      >
        <Upload className="h-3.5 w-3.5" />
        {uploadLabel}
      </button>
    </div>
  );
}

function Tabs({
  tabs,
  active,
  onSelect,
  labels,
}: {
  tabs: TabConfig[];
  active: ProductType;
  onSelect: (id: ProductType) => void;
  labels: CabinetNewOrderTranslations;
}) {
  return (
    <div
      role="tablist"
      aria-label="Product type"
      className="flex border-b border-gray-200 bg-gray-50/60"
    >
      {tabs.map((tab) => {
        const Icon = tab.Icon;
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(tab.id)}
            className={cn(
              "relative flex flex-1 items-center justify-center gap-2 px-3 py-3 text-sm font-medium transition-colors",
              "sm:flex-none sm:px-5",
              isActive
                ? "text-gray-900"
                : "text-gray-500 hover:bg-white hover:text-gray-800",
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{labels[tab.label]}</span>
            {isActive ? (
              <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-t-full bg-gold sm:inset-x-5" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
