"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  usePublicMugProducts,
  usePublicNotebookProducts,
  usePublicLargeFormatMaterials,
  type PublicLargeFormatMaterial,
} from "@/lib/swr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  Coffee,
  FileText,
  Loader2,
  Maximize,
  Pencil,
  Plus,
  Send,
  Trash2,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MenuSelect,
  type MenuSelectOption,
} from "@/components/ui/MenuSelect";
import { FileDropzone } from "@/components/upload/FileDropzone";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { exportCanvasAsBlob, blobToFile } from "@/lib/mug/exportLayout";
import {
  getImageDimensions,
  validateLayoutSize,
  type SizeValidationResult,
} from "@/lib/imageDimensions";
import { cmToPx } from "@/lib/printDimensions";
import type { MugLayoutData, NotebookLayoutData, ProductType } from "@/lib/validations";
import {
  PaperOrderForm,
  EMPTY_PAPER_VALUE,
  MAX_ADMIN_COPIES,
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
import { LfRollPackPreview } from "@/app/admin/_components/LfRollPackPreview";
import { computeLargeFormatRollLayout } from "@/lib/largeFormat/largeFormatRollPack";
import type { LargeFormatRollPackResult } from "@/lib/largeFormat/largeFormatRollPack";
import { resolveGalleryWrapCm } from "@/lib/largeFormat/lfLayoutBorder";
import { cn } from "@/lib/utils";
import { formatAmountMdl } from "@/lib/money";
import type { TranslationDictionary } from "@/lib/i18n/types";

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

type TabLabelKey = "tabPaper" | "tabMug" | "tabNotebook" | "tabLargeFormat";

type TabConfig = {
  id: ProductType;
  Icon: LucideIcon;
  label: TabLabelKey;
};

const TABS: TabConfig[] = [
  { id: "paper_print", Icon: FileText, label: "tabPaper" },
  { id: "mug", Icon: Coffee, label: "tabMug" },
  { id: "notebook", Icon: BookOpen, label: "tabNotebook" },
  { id: "large_format_print", Icon: Maximize, label: "tabLargeFormat" },
];

/** Local state for a large-format sub-position. */
type LfFormValue = {
  materialId: string | null;
  /** Selected size preset id, or null for a custom width/height. */
  presetId: string | null;
  widthStr: string;
  heightStr: string;
  quantityStr: string;
  /** Print-ready artwork, uploaded on submit (mirrors the paper flow). */
  file: File | null;
};

const EMPTY_LF_VALUE: LfFormValue = {
  materialId: null,
  presetId: null,
  widthStr: "",
  heightStr: "",
  quantityStr: "1",
  file: null,
};

/** Result of the debounced server price quote for an LF position. */
type LfQuoteState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; totalMdl: number; linearMeters: number; customerType: "retail" | "dealer" }
  | { status: "error"; code: string };

type SubmitFailure = { kind: "generic"; message: string };

/** Shared selection shape of MugProductSelection / NotebookProductSelection. */
type RowSelection = { type: "catalog"; productId: string } | { type: "other" };

/** `MenuSelect` sentinel for the "other / not in catalog" choice. */
const OTHER_SKU = "__other__";

function selectionToValue(sel: RowSelection | null): string {
  if (sel?.type === "catalog") return sel.productId;
  if (sel?.type === "other") return OTHER_SKU;
  return "";
}

function valueToSelection(v: string): RowSelection {
  return v === OTHER_SKU ? { type: "other" } : { type: "catalog", productId: v };
}

/**
 * One layout row inside the mug/notebook block. Upload rows come from the
 * block's dropzone (one file = one row = one order line); editor rows are
 * added via the "design in editor" button and render the full editor form.
 */
type ProductRow<V> = {
  id: string;
  value: V;
  /**
   * Pixel size of the uploaded layout, read once when the file is added.
   * `null` = unreadable (validation skipped), absent on editor rows.
   */
  dims?: { width: number; height: number } | null;
};

type MugRow = ProductRow<MugFormValue>;
type NotebookRow = ProductRow<NotebookFormValue>;

type LfItem = { id: string; value: LfFormValue };

/**
 * Status reported by each LF sub-position. `active` means the customer
 * actually started filling it (file attached or a size typed) — inactive
 * items are ignored on submit instead of blocking it.
 */
type LfItemStatus = { active: boolean; valid: boolean; priceMdl: number | null };

/** Derived validity/price of a mug/notebook row (all inputs are sync). */
type RowState = {
  valid: boolean;
  priceMdl: number | null;
  sizeCheck: SizeValidationResult | null;
};

type CatalogItemLike = {
  id: string;
  printWidthCm: number;
  printHeightCm: number;
  printDpi: number;
  sellPrice?: number | null;
};

function computeRowState(
  row: ProductRow<{
    mode: "editor" | "upload";
    selection: RowSelection | null;
    customLayoutFile: File | null;
    photos: string[];
    copiesStr: string;
  }>,
  items: CatalogItemLike[],
): RowState {
  const copies = parseAdminCopiesInput(row.value.copiesStr);
  const selection = row.value.selection;
  const item =
    selection?.type === "catalog"
      ? items.find((i) => i.id === selection.productId)
      : undefined;

  let sizeCheck: SizeValidationResult | null = null;
  if (row.value.mode === "upload" && item && row.dims) {
    sizeCheck = validateLayoutSize(row.dims, {
      width: cmToPx(item.printWidthCm, item.printDpi),
      height: cmToPx(item.printHeightCm, item.printDpi),
    });
  }

  let valid = selection != null && copies !== null;
  if (valid) {
    if (row.value.mode === "upload") {
      valid = row.value.customLayoutFile != null && !(sizeCheck && !sizeCheck.ok);
    } else {
      valid = row.value.photos.length > 0;
    }
  }

  const priceMdl =
    valid && item?.sellPrice != null && copies !== null
      ? item.sellPrice * copies
      : null;
  return { valid, priceMdl, sizeCheck };
}

/** Frees blob URLs owned by a removed mug/notebook row. */
function revokeRowBlobUrls(value: {
  customLayoutUrl: string | null;
  photos: string[];
}): void {
  if (value.customLayoutUrl?.startsWith("blob:")) {
    URL.revokeObjectURL(value.customLayoutUrl);
  }
  for (const url of value.photos) {
    if (url.startsWith("blob:")) URL.revokeObjectURL(url);
  }
}

/**
 * Cabinet "new order" page organised around product-type tabs (Paper / Mug /
 * Notebook / Large format). Only the active tab is visible — inactive panels
 * stay mounted (`hidden`) so mug/notebook canvases and LF quotes survive
 * switches. Each tab still accepts multiple positions; empty tabs are
 * skipped on submit. Submission posts `lines[]` to `POST /api/orders`.
 */
export default function CabinetNewOrderClient({
  viewer,
}: {
  viewer: CabinetViewer;
}) {
  const router = useRouter();
  const { t, locale } = useLanguageStore();
  const tt = t.cabinet.newOrder;

  const { items: rawMugItems } = usePublicMugProducts();
  const mugProductItems = rawMugItems as MugProductOption[];
  const { items: rawNotebookItems } = usePublicNotebookProducts();
  const notebookProductItems = rawNotebookItems as NotebookProductOption[];
  const { items: lfMaterials } = usePublicLargeFormatMaterials();

  const [paper, setPaper] = useState<PaperFormValue>(EMPTY_PAPER_VALUE);

  const [mugSelection, setMugSelection] = useState<MugProductSelection | null>(null);
  const [mugRows, setMugRows] = useState<MugRow[]>([]);
  const [nbSelection, setNbSelection] = useState<NotebookProductSelection | null>(null);
  const [nbRows, setNbRows] = useState<NotebookRow[]>([]);

  const [lfItems, setLfItems] = useState<LfItem[]>([
    { id: "lf-initial", value: EMPTY_LF_VALUE },
  ]);
  const [lfStatuses, setLfStatuses] = useState<Record<string, LfItemStatus>>({});

  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<SubmitFailure | null>(null);
  const [activeTab, setActiveTab] = useState<ProductType>("paper_print");

  const mugFormRefs = useRef(new Map<string, MugOrderFormHandle | null>());
  const notebookFormRefs = useRef(new Map<string, NotebookOrderFormHandle | null>());

  // Pre-select the first catalog SKU in each block once the catalog loads.
  useEffect(() => {
    if (!mugSelection && mugProductItems.length > 0) {
      setMugSelection({ type: "catalog", productId: mugProductItems[0]!.id });
    }
  }, [mugProductItems, mugSelection]);
  useEffect(() => {
    if (!nbSelection && notebookProductItems.length > 0) {
      setNbSelection({ type: "catalog", productId: notebookProductItems[0]!.id });
    }
  }, [notebookProductItems, nbSelection]);

  // ---- Mug rows ------------------------------------------------------------

  const addMugFiles = useCallback(
    async (files: File[]) => {
      const rows: MugRow[] = [];
      for (const file of files) {
        let dims: { width: number; height: number } | null = null;
        try {
          dims = await getImageDimensions(file);
        } catch {
          dims = null;
        }
        rows.push({
          id: crypto.randomUUID(),
          dims,
          value: {
            ...EMPTY_MUG_VALUE,
            mode: "upload",
            selection: mugSelection,
            customLayoutFile: file,
            customLayoutUrl: URL.createObjectURL(file),
          },
        });
      }
      setMugRows((prev) => [...prev, ...rows]);
    },
    [mugSelection],
  );

  const addMugEditorRow = useCallback(() => {
    setMugRows((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        value: { ...EMPTY_MUG_VALUE, mode: "editor", selection: mugSelection },
      },
    ]);
  }, [mugSelection]);

  const patchMugRow = useCallback(
    (id: string, updater: (prev: MugFormValue) => MugFormValue) => {
      setMugRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, value: updater(r.value) } : r)),
      );
    },
    [],
  );

  const removeMugRow = useCallback((id: string) => {
    setMugRows((prev) => {
      const target = prev.find((r) => r.id === id);
      if (target) revokeRowBlobUrls(target.value);
      return prev.filter((r) => r.id !== id);
    });
    mugFormRefs.current.delete(id);
  }, []);

  // ---- Notebook rows -------------------------------------------------------

  const addNbFiles = useCallback(
    async (files: File[]) => {
      const rows: NotebookRow[] = [];
      for (const file of files) {
        let dims: { width: number; height: number } | null = null;
        try {
          dims = await getImageDimensions(file);
        } catch {
          dims = null;
        }
        rows.push({
          id: crypto.randomUUID(),
          dims,
          value: {
            ...EMPTY_NOTEBOOK_VALUE,
            mode: "upload",
            selection: nbSelection,
            customLayoutFile: file,
            customLayoutUrl: URL.createObjectURL(file),
          },
        });
      }
      setNbRows((prev) => [...prev, ...rows]);
    },
    [nbSelection],
  );

  const addNbEditorRow = useCallback(() => {
    setNbRows((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        value: { ...EMPTY_NOTEBOOK_VALUE, mode: "editor", selection: nbSelection },
      },
    ]);
  }, [nbSelection]);

  const patchNbRow = useCallback(
    (id: string, updater: (prev: NotebookFormValue) => NotebookFormValue) => {
      setNbRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, value: updater(r.value) } : r)),
      );
    },
    [],
  );

  const removeNbRow = useCallback((id: string) => {
    setNbRows((prev) => {
      const target = prev.find((r) => r.id === id);
      if (target) revokeRowBlobUrls(target.value);
      return prev.filter((r) => r.id !== id);
    });
    notebookFormRefs.current.delete(id);
  }, []);

  // ---- Large-format items --------------------------------------------------

  const addLfItem = useCallback(() => {
    setLfItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), value: EMPTY_LF_VALUE },
    ]);
  }, []);

  const patchLfItem = useCallback((id: string, next: LfFormValue) => {
    setLfItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, value: next } : it)),
    );
  }, []);

  const removeLfItem = useCallback((id: string) => {
    setLfItems((prev) => prev.filter((it) => it.id !== id));
    setLfStatuses((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const reportLfStatus = useCallback((id: string, status: LfItemStatus) => {
    setLfStatuses((prev) => {
      const cur = prev[id];
      if (
        cur &&
        cur.active === status.active &&
        cur.valid === status.valid &&
        cur.priceMdl === status.priceMdl
      ) {
        return prev;
      }
      return { ...prev, [id]: status };
    });
  }, []);

  // ---- Derived validity / totals --------------------------------------------

  const mugRowStates = useMemo(() => {
    const m = new Map<string, RowState>();
    for (const row of mugRows) m.set(row.id, computeRowState(row, mugProductItems));
    return m;
  }, [mugRows, mugProductItems]);

  const nbRowStates = useMemo(() => {
    const m = new Map<string, RowState>();
    for (const row of nbRows) {
      m.set(row.id, computeRowState(row, notebookProductItems));
    }
    return m;
  }, [nbRows, notebookProductItems]);

  const paperIncluded = paper.files.length > 0;
  const paperValid = parseAdminCopiesInput(paper.copiesStr) !== null;
  const activeLfCount = lfItems.filter((it) => lfStatuses[it.id]?.active).length;

  const lineCount =
    (paperIncluded ? 1 : 0) + mugRows.length + nbRows.length + activeLfCount;

  const canSubmit =
    lineCount > 0 &&
    (!paperIncluded || paperValid) &&
    mugRows.every((r) => mugRowStates.get(r.id)?.valid === true) &&
    nbRows.every((r) => nbRowStates.get(r.id)?.valid === true) &&
    lfItems.every((it) => {
      const st = lfStatuses[it.id];
      return !st?.active || st.valid;
    });

  // Shown only when every included line has a client-side price estimate — a
  // partial sum would mislead. The server remains authoritative.
  const estimatedTotal = useMemo<number | null>(() => {
    const prices: (number | null)[] = [];
    if (paperIncluded) prices.push(null);
    for (const row of mugRows) prices.push(mugRowStates.get(row.id)?.priceMdl ?? null);
    for (const row of nbRows) prices.push(nbRowStates.get(row.id)?.priceMdl ?? null);
    for (const it of lfItems) {
      const st = lfStatuses[it.id];
      if (st?.active) prices.push(st.priceMdl);
    }
    if (prices.length === 0) return null;
    let sum = 0;
    for (const p of prices) {
      if (p == null) return null;
      sum += p;
    }
    return sum;
  }, [paperIncluded, mugRows, mugRowStates, nbRows, nbRowStates, lfItems, lfStatuses]);

  // ---- Line builders (submit) -----------------------------------------------

  async function buildPaperLine(): Promise<Record<string, unknown>> {
    const copies = parseAdminCopiesInput(paper.copiesStr);
    if (paper.files.length === 0 || copies === null) {
      throw new Error("Invalid file list / copies");
    }
    const resolvedPaper =
      paper.paperType === "other" &&
      paper.customWidth.trim() &&
      paper.customHeight.trim()
        ? `other:${paper.customWidth.trim()}x${paper.customHeight.trim()}`
        : paper.paperType;
    const fileData = await Promise.all(
      paper.files.map(async (entry) => {
        const upload = await uploadFile(entry.file);
        return {
          fileName: upload.fileName,
          fileUrl: upload.fileUrl,
          copies,
          color: paper.color,
          paperType: resolvedPaper,
          pageCount: entry.pageCount,
        };
      }),
    );
    return { productType: "paper_print", files: fileData };
  }

  async function buildMugLine(row: MugRow): Promise<Record<string, unknown>> {
    const value = row.value;
    const copies = parseAdminCopiesInput(value.copiesStr);
    if (copies === null) throw new Error("Invalid copies");

    const mugOther = value.selection?.type === "other";
    const mugCatId =
      value.selection?.type === "catalog" ? value.selection.productId : null;

    let mugFile: File;
    let mugLayoutData: MugLayoutData | undefined;

    if (value.mode === "upload") {
      if (!value.customLayoutFile) throw new Error("No layout file");
      mugFile = value.customLayoutFile;
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
      const canvas = mugFormRefs.current.get(row.id)?.getCanvas();
      if (!canvas) throw new Error("Canvas not available");

      const photoFileKeys = await Promise.all(value.photos.map(uploadPhotoUrl));

      mugLayoutData = {
        templateId: value.template.id,
        text: value.text,
        fontFamily: value.fontFamily,
        textColor: value.textColor,
        backgroundColor: value.backgroundColor,
        photoUrls: photoFileKeys,
        photoSettings: value.photoSettings,
      };

      const blob = await exportCanvasAsBlob(canvas);
      mugFile = blobToFile(blob, `mug-layout-${Date.now()}.png`);
    }

    const { fileName, fileUrl } = await uploadFile(mugFile);

    return {
      productType: "mug",
      mugLayoutData,
      mugOther,
      ...(mugCatId ? { mugProductId: mugCatId } : {}),
      files: [{ fileName, fileUrl, copies, color: "color" }],
    };
  }

  async function buildNotebookLine(row: NotebookRow): Promise<Record<string, unknown>> {
    const value = row.value;
    const copies = parseAdminCopiesInput(value.copiesStr);
    if (copies === null) throw new Error("Invalid copies");

    const notebookOther = value.selection?.type === "other";
    const notebookCatId =
      value.selection?.type === "catalog" ? value.selection.productId : null;

    let notebookFile: File;
    let notebookLayoutData: NotebookLayoutData | undefined;

    if (value.mode === "upload") {
      if (!value.customLayoutFile) throw new Error("No layout file");
      notebookFile = value.customLayoutFile;
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
      const canvas = notebookFormRefs.current.get(row.id)?.getCanvas();
      if (!canvas) throw new Error("Canvas not available");

      const photoFileKeys = await Promise.all(value.photos.map(uploadPhotoUrl));

      notebookLayoutData = {
        templateId: value.template.id,
        text: value.text,
        fontFamily: value.fontFamily,
        textColor: value.textColor,
        backgroundColor: value.backgroundColor,
        photoUrls: photoFileKeys,
        photoSettings: value.photoSettings,
      };

      const blob = await exportCanvasAsBlob(canvas);
      notebookFile = blobToFile(blob, `notebook-layout-${Date.now()}.png`);
    }

    const { fileName, fileUrl } = await uploadFile(notebookFile);

    return {
      productType: "notebook",
      notebookLayoutData,
      notebookOther,
      ...(notebookCatId ? { notebookProductId: notebookCatId } : {}),
      files: [{ fileName, fileUrl, copies, color: "color" }],
    };
  }

  async function buildLfLine(value: LfFormValue): Promise<Record<string, unknown>> {
    const lfWidthCm = Number.parseFloat(value.widthStr);
    const lfHeightCm = Number.parseFloat(value.heightStr);
    const lfQty = Number.parseInt(value.quantityStr, 10);
    if (!value.materialId) throw new Error("No material selected");
    if (!value.file) throw new Error("No print file");
    if (
      !Number.isFinite(lfWidthCm) ||
      lfWidthCm <= 0 ||
      !Number.isFinite(lfHeightCm) ||
      lfHeightCm <= 0 ||
      !Number.isInteger(lfQty) ||
      lfQty < 1
    ) {
      throw new Error("Invalid size");
    }

    const { fileName, fileUrl } = await uploadFile(value.file);

    return {
      productType: "large_format_print",
      largeFormatMaterialId: value.materialId,
      printWidthCm: lfWidthCm,
      printHeightCm: lfHeightCm,
      quantity: lfQty,
      lfSizePresetId: value.presetId ?? null,
      files: [
        {
          fileName,
          fileUrl,
          copies: lfQty,
          color: "color",
          paperType: "large_format",
        },
      ],
    };
  }

  async function handleSubmit(): Promise<void> {
    if (submitting || !canSubmit) return;
    setFailure(null);
    setSubmitting(true);

    try {
      const lines: Record<string, unknown>[] = [];
      if (paperIncluded) lines.push(await buildPaperLine());
      for (const row of mugRows) lines.push(await buildMugLine(row));
      for (const row of nbRows) lines.push(await buildNotebookLine(row));
      for (const it of lfItems) {
        if (lfStatuses[it.id]?.active) lines.push(await buildLfLine(it.value));
      }

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: notes.trim() || undefined,
          lines,
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          detail?: string;
          code?: string;
        };
        if (body.detail || body.error) {
          console.error(
            "[/api/orders cabinet] %s — %s",
            body.error ?? `HTTP ${res.status}`,
            body.detail ?? "(no detail)",
          );
        }
        setFailure({
          kind: "generic",
          message:
            lfErrorMessage(body.code, t) ??
            body.error ??
            t.cabinet.newOrder.submitFailed,
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

  // ---- SKU select options (compact per-row picker) ---------------------------

  const mugSkuOptions = useMemo<MenuSelectOption<string>[]>(
    () => [
      ...mugProductItems.map((p) => ({
        value: p.id,
        label: mugProductDisplayName(p, locale),
        description: skuOptionDescription(
          p.sku,
          p.sellPrice ?? null,
          t.admin.currency,
        ),
        leading: skuOptionThumb(p.imagePublicUrl, p.bodyColorHex),
      })),
      { value: OTHER_SKU, label: t.admin.mugProductOtherLabel },
    ],
    [mugProductItems, locale, t],
  );

  const nbSkuOptions = useMemo<MenuSelectOption<string>[]>(
    () => [
      ...notebookProductItems.map((p) => ({
        value: p.id,
        label: notebookProductDisplayName(p, locale),
        description: skuOptionDescription(
          p.sku,
          p.sellPrice ?? null,
          t.admin.currency,
        ),
        leading: skuOptionThumb(p.imagePublicUrl, p.coverColorHex),
      })),
      { value: OTHER_SKU, label: t.admin.notebookProductOtherLabel },
    ],
    [notebookProductItems, locale, t],
  );

  const mugUploadRows = mugRows.filter((r) => r.value.mode === "upload");
  const mugEditorRows = mugRows.filter((r) => r.value.mode === "editor");
  const nbUploadRows = nbRows.filter((r) => r.value.mode === "upload");
  const nbEditorRows = nbRows.filter((r) => r.value.mode === "editor");

  return (
    <div className="space-y-5 sm:space-y-6">
      <Link
        href="/cabinet/orders"
        className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        {tt.backToOrders}
      </Link>

      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {tt.title}
          </h1>
          <p className="mt-1 text-sm text-gray-500 sm:text-base">
            {tt.subtitle}
          </p>
        </div>

        <ViewerBanner viewer={viewer} sendingAs={tt.sendingAs} />
      </header>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <Tabs
          tabs={TABS}
          active={activeTab}
          onSelect={setActiveTab}
          labels={{
            tabPaper: tt.tabPaper,
            tabMug: tt.tabMug,
            tabNotebook: tt.tabNotebook,
            tabLargeFormat: tt.tabLargeFormat,
          }}
          counts={{
            paper_print: paper.files.length,
            mug: mugRows.length,
            notebook: nbRows.length,
            large_format_print: activeLfCount,
          }}
        />

        <div className="space-y-4 p-3 sm:space-y-5 sm:p-4">
          <div
            className={activeTab === "paper_print" ? "space-y-4" : "hidden"}
            aria-hidden={activeTab !== "paper_print"}
          >
            <PaperOrderForm value={paper} onChange={setPaper} t={t} />
          </div>

          <div
            className={
              activeTab === "mug" ? "space-y-3" : "hidden"
            }
            aria-hidden={activeTab !== "mug"}
          >
            <BlockDropzone
              title={tt.blockDropTitle}
              onFiles={(files) => void addMugFiles(files)}
            />
            {mugUploadRows.map((row) => {
              const state = mugRowStates.get(row.id);
              return (
                <UploadRowView
                  key={row.id}
                  fileName={row.value.customLayoutFile?.name ?? ""}
                  previewUrl={row.value.customLayoutUrl}
                  selectionValue={selectionToValue(row.value.selection)}
                  options={mugSkuOptions}
                  onSelectionChange={(v) =>
                    patchMugRow(row.id, (prev) => ({
                      ...prev,
                      selection: valueToSelection(v),
                    }))
                  }
                  copiesStr={row.value.copiesStr}
                  onCopiesChange={(copiesStr) =>
                    patchMugRow(row.id, (prev) => ({ ...prev, copiesStr }))
                  }
                  priceMdl={state?.priceMdl ?? null}
                  sizeCheck={state?.sizeCheck ?? null}
                  onRemove={() => removeMugRow(row.id)}
                  t={t}
                />
              );
            })}
            <Button
              type="button"
              variant="outline"
              onClick={addMugEditorRow}
              className="w-full border-dashed"
            >
              <Pencil className="h-4 w-4" />
              {tt.designInEditor}
            </Button>

        {mugEditorRows.map((row) => (
          <EditorRowCard
            key={row.id}
            title={tt.editorRowTitle}
            selectionValue={selectionToValue(row.value.selection)}
            options={mugSkuOptions}
            onSelectionChange={(v) =>
              patchMugRow(row.id, (prev) => ({
                ...prev,
                selection: valueToSelection(v),
              }))
            }
            copiesStr={row.value.copiesStr}
            onCopiesChange={(copiesStr) =>
              patchMugRow(row.id, (prev) => ({ ...prev, copiesStr }))
            }
            priceMdl={mugRowStates.get(row.id)?.priceMdl ?? null}
            onRemove={() => removeMugRow(row.id)}
            t={t}
          >
            <MugOrderForm
              ref={(h) => {
                mugFormRefs.current.set(row.id, h);
              }}
              value={row.value}
              onChange={(next) =>
                patchMugRow(row.id, (prev) =>
                  typeof next === "function" ? next(prev) : next,
                )
              }
              productItems={mugProductItems}
              t={t}
              hideProductPicker
              hideCopiesBar
            />
          </EditorRowCard>
        ))}
          </div>

          <div
            className={
              activeTab === "notebook" ? "space-y-3" : "hidden"
            }
            aria-hidden={activeTab !== "notebook"}
          >
            <BlockDropzone
              title={tt.blockDropTitle}
              onFiles={(files) => void addNbFiles(files)}
            />
            {nbUploadRows.map((row) => {
              const state = nbRowStates.get(row.id);
              return (
                <UploadRowView
                  key={row.id}
                  fileName={row.value.customLayoutFile?.name ?? ""}
                  previewUrl={row.value.customLayoutUrl}
                  selectionValue={selectionToValue(row.value.selection)}
                  options={nbSkuOptions}
                  onSelectionChange={(v) =>
                    patchNbRow(row.id, (prev) => ({
                      ...prev,
                      selection: valueToSelection(v),
                    }))
                  }
                  copiesStr={row.value.copiesStr}
                  onCopiesChange={(copiesStr) =>
                    patchNbRow(row.id, (prev) => ({ ...prev, copiesStr }))
                  }
                  priceMdl={state?.priceMdl ?? null}
                  sizeCheck={state?.sizeCheck ?? null}
                  onRemove={() => removeNbRow(row.id)}
                  t={t}
                />
              );
            })}
            <Button
              type="button"
              variant="outline"
              onClick={addNbEditorRow}
              className="w-full border-dashed"
            >
              <Pencil className="h-4 w-4" />
              {tt.designInEditor}
            </Button>

        {nbEditorRows.map((row) => (
          <EditorRowCard
            key={row.id}
            title={tt.editorRowTitle}
            selectionValue={selectionToValue(row.value.selection)}
            options={nbSkuOptions}
            onSelectionChange={(v) =>
              patchNbRow(row.id, (prev) => ({
                ...prev,
                selection: valueToSelection(v),
              }))
            }
            copiesStr={row.value.copiesStr}
            onCopiesChange={(copiesStr) =>
              patchNbRow(row.id, (prev) => ({ ...prev, copiesStr }))
            }
            priceMdl={nbRowStates.get(row.id)?.priceMdl ?? null}
            onRemove={() => removeNbRow(row.id)}
            t={t}
          >
            <NotebookOrderForm
              ref={(h) => {
                notebookFormRefs.current.set(row.id, h);
              }}
              value={row.value}
              onChange={(next) =>
                patchNbRow(row.id, (prev) =>
                  typeof next === "function" ? next(prev) : next,
                )
              }
              productItems={notebookProductItems}
              t={t}
              hideProductPicker
              hideCopiesBar
            />
          </EditorRowCard>
        ))}
          </div>

          <div
            className={
              activeTab === "large_format_print" ? "space-y-4" : "hidden"
            }
            aria-hidden={activeTab !== "large_format_print"}
          >
        {lfItems.map((item) => (
          <LfItemBody
            key={item.id}
            itemId={item.id}
            value={item.value}
            materials={lfMaterials}
            onChange={(next) => patchLfItem(item.id, next)}
            onStatus={reportLfStatus}
            onRemove={
              lfItems.length > 1 ? () => removeLfItem(item.id) : undefined
            }
            removeLabel={tt.removePosition}
            t={t}
          />
        ))}
        <Button
          type="button"
          variant="outline"
          onClick={addLfItem}
          className="w-full border-dashed"
        >
          <Plus className="h-4 w-4" />
          {tt.lfAddSize}
        </Button>
          </div>
        </div>
      </div>

      {/* Order-level footer: summary, notes, submit. */}
      <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span className="font-medium text-gray-700">
            {tt.positionsSummary(lineCount)}
          </span>
          {estimatedTotal != null ? (
            <span className="text-gray-500">
              {tt.estimatedTotal}{" "}
              <span className="font-bold tabular-nums text-gray-900">
                {formatAmountMdl(estimatedTotal, t.admin.currency)}
              </span>
            </span>
          ) : null}
        </div>

        {failure ? (
          <p
            role="alert"
            className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {failure.message}
          </p>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <input
            id="cabinet-order-notes"
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 500))}
            placeholder={tt.notesPlaceholder}
            aria-label={tt.notesLabel}
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
            {submitting ? tt.submitting : tt.submit}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Product-type tab strip with a count badge on filled tabs. */
function Tabs({
  tabs,
  active,
  onSelect,
  labels,
  counts,
}: {
  tabs: TabConfig[];
  active: ProductType;
  onSelect: (id: ProductType) => void;
  labels: Record<TabLabelKey, string>;
  counts: Record<ProductType, number>;
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
        const count = counts[tab.id];
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
            {count > 0 ? (
              <span className="rounded-full bg-gold/15 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-gold-dark">
                {count}
              </span>
            ) : null}
            {isActive ? (
              <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-t-full bg-gold sm:inset-x-5" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Compact multi-file dropzone used inside the mug/notebook blocks. */
function BlockDropzone({
  title,
  onFiles,
}: {
  title: string;
  onFiles: (files: File[]) => void;
}) {
  return (
    <FileDropzone
      accept="image/png,image/jpeg,image/webp"
      multiple
      onFiles={onFiles}
      ariaLabel={title}
      className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50/40 px-4 py-5 text-center transition-colors hover:border-gold hover:bg-gold-light/20"
      dragActiveClassName="border-gold bg-gold-light/30"
    >
      <Upload className="h-5 w-5 text-gray-500" />
      <span className="text-xs font-medium text-gray-700">{title}</span>
    </FileDropzone>
  );
}

/** Small copies input shared by upload rows and editor row headers. */
function CopiesInput({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
}) {
  const valid = parseAdminCopiesInput(value) !== null;
  return (
    <Input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 7))}
      onBlur={() => {
        const digits = value.replace(/\D/g, "");
        if (digits === "") {
          onChange("1");
          return;
        }
        let n = parseInt(digits, 10);
        if (!Number.isFinite(n) || n < 1) n = 1;
        if (n > MAX_ADMIN_COPIES) n = MAX_ADMIN_COPIES;
        onChange(String(n));
      }}
      aria-label={ariaLabel}
      aria-invalid={!valid}
      className="h-9 w-16 shrink-0 text-right tabular-nums"
    />
  );
}

/**
 * Compact uploaded-layout row: thumbnail + name + per-row SKU select +
 * copies + price + remove, with an inline size-mismatch warning.
 */
function UploadRowView({
  fileName,
  previewUrl,
  selectionValue,
  options,
  onSelectionChange,
  copiesStr,
  onCopiesChange,
  priceMdl,
  sizeCheck,
  onRemove,
  t,
}: {
  fileName: string;
  previewUrl: string | null;
  selectionValue: string;
  options: MenuSelectOption<string>[];
  onSelectionChange: (v: string) => void;
  copiesStr: string;
  onCopiesChange: (v: string) => void;
  priceMdl: number | null;
  sizeCheck: SizeValidationResult | null;
  onRemove: () => void;
  t: TranslationDictionary;
}) {
  const tt = t.cabinet.newOrder;
  return (
    <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-2.5">
      <div className="flex flex-wrap items-center gap-2.5">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt=""
            className="h-12 w-12 shrink-0 rounded-lg border border-gray-100 bg-gray-50 object-cover"
          />
        ) : null}
        <div className="min-w-0 flex-1 basis-32">
          <p className="truncate text-sm font-medium text-gray-900" title={fileName}>
            {fileName}
          </p>
          {priceMdl != null ? (
            <p className="text-xs font-semibold tabular-nums text-gold">
              {formatAmountMdl(priceMdl, t.admin.currency)}
            </p>
          ) : null}
        </div>
        <MenuSelect
          value={selectionValue}
          options={options}
          onChange={onSelectionChange}
          ariaLabel={tt.modelLabel}
          className="min-w-[16rem] flex-1"
          popoverMinWidthPx={320}
          searchable={options.length > 6}
          searchPlaceholder={t.productPicker.searchPlaceholder}
        />
        <CopiesInput
          value={copiesStr}
          onChange={onCopiesChange}
          ariaLabel={t.upload.copiesLabel}
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label={tt.removePosition}
          title={tt.removePosition}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {sizeCheck && !sizeCheck.ok ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
          {t.admin.layoutValidation.sizeMismatch(
            sizeCheck.expected.width,
            sizeCheck.expected.height,
            sizeCheck.actual.width,
            sizeCheck.actual.height,
          )}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Expanded editor-row card: header (title, per-row SKU select, copies,
 * remove) + the full mug/notebook editor form as children.
 */
function EditorRowCard({
  title,
  selectionValue,
  options,
  onSelectionChange,
  copiesStr,
  onCopiesChange,
  priceMdl,
  onRemove,
  t,
  children,
}: {
  title: string;
  selectionValue: string;
  options: MenuSelectOption<string>[];
  onSelectionChange: (v: string) => void;
  copiesStr: string;
  onCopiesChange: (v: string) => void;
  priceMdl: number | null;
  onRemove: () => void;
  t: TranslationDictionary;
  children: React.ReactNode;
}) {
  const tt = t.cabinet.newOrder;
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-gray-100 bg-gray-50/60 px-3 py-2.5">
        <Pencil className="h-4 w-4 shrink-0 text-gold" />
        <span className="min-w-0 flex-1 basis-32 truncate text-sm font-medium text-gray-900">
          {title}
        </span>
        {priceMdl != null ? (
          <span className="text-xs font-semibold tabular-nums text-gold">
            {formatAmountMdl(priceMdl, t.admin.currency)}
          </span>
        ) : null}
        <MenuSelect
          value={selectionValue}
          options={options}
          onChange={onSelectionChange}
          ariaLabel={tt.modelLabel}
          className="min-w-[16rem] flex-1"
          popoverMinWidthPx={320}
          searchable={options.length > 6}
          searchPlaceholder={t.productPicker.searchPlaceholder}
        />
        <CopiesInput
          value={copiesStr}
          onChange={onCopiesChange}
          ariaLabel={t.upload.copiesLabel}
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label={tt.removePosition}
          title={tt.removePosition}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="p-3 sm:p-4">{children}</div>
    </div>
  );
}

/**
 * One large-format sub-position: material + size + quantity + artwork, with
 * a local roll-pack preview and a debounced server price quote (tier
 * resolved server-side from the session). Reports `active` so untouched
 * sub-forms don't block submission.
 */
function LfItemBody({
  itemId,
  value,
  materials,
  onChange,
  onStatus,
  onRemove,
  removeLabel,
  t,
}: {
  itemId: string;
  value: LfFormValue;
  materials: PublicLargeFormatMaterial[];
  onChange: (next: LfFormValue) => void;
  onStatus: (id: string, status: LfItemStatus) => void;
  onRemove?: () => void;
  removeLabel: string;
  t: TranslationDictionary;
}) {
  const [quote, setQuote] = useState<LfQuoteState>({ status: "idle" });

  const material = useMemo<PublicLargeFormatMaterial | null>(
    () => materials.find((m) => m.id === value.materialId) ?? null,
    [materials, value.materialId],
  );

  const widthCm = Number.parseFloat(value.widthStr);
  const heightCm = Number.parseFloat(value.heightStr);
  const qty = Number.parseInt(value.quantityStr, 10);
  const dimsValid =
    Number.isFinite(widthCm) &&
    widthCm > 0 &&
    Number.isFinite(heightCm) &&
    heightCm > 0 &&
    Number.isInteger(qty) &&
    qty >= 1;

  // The customer "started" this sub-position: artwork attached or a size
  // typed. Auto-selected material alone doesn't count.
  const active =
    value.file != null ||
    value.widthStr.trim() !== "" ||
    value.heightStr.trim() !== "";

  // Local roll-pack preview — mirrors the server packing (gallery-wrap margin +
  // effective printable width) so "fits / does not fit" matches the order-time
  // result without a round-trip.
  const pack = useMemo<LargeFormatRollPackResult | null>(() => {
    if (!material || !dimsValid) return null;
    const wrap = resolveGalleryWrapCm(material.name);
    return computeLargeFormatRollLayout({
      printableWidthCm: material.printableWidthMeters * 100,
      nominalRollWidthMeters: material.rollWidthMeters,
      printWidthCm: widthCm + 2 * wrap,
      printHeightCm: heightCm + 2 * wrap,
      quantity: qty,
    });
  }, [material, dimsValid, widthCm, heightCm, qty]);

  // Auto-select the first material once the catalog loads.
  useEffect(() => {
    if (value.materialId || materials.length === 0) return;
    onChange({ ...value, materialId: materials[0]!.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materials, value.materialId]);

  // Debounced price quote. The server is authoritative (tier derived from the
  // session); we only call it when inputs are valid and the size fits the roll.
  useEffect(() => {
    if (!value.materialId || !dimsValid) {
      setQuote({ status: "idle" });
      return;
    }
    if (pack && !pack.ok) {
      setQuote({
        status: "error",
        code:
          pack.code === "quantity_too_large"
            ? "lf_pack_quantity_too_large"
            : "lf_pack_does_not_fit",
      });
      return;
    }

    let cancelled = false;
    setQuote({ status: "loading" });
    const handle = setTimeout(async () => {
      try {
        const res = await fetch("/api/large-format-quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            largeFormatMaterialId: value.materialId,
            printWidthCm: widthCm,
            printHeightCm: heightCm,
            quantity: qty,
            lfSizePresetId: value.presetId ?? null,
          }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          totalSellPriceMdl?: number;
          calculatedLinearMeters?: number;
          customerType?: "retail" | "dealer";
          code?: string;
        };
        if (cancelled) return;
        if (res.ok && body.ok && typeof body.totalSellPriceMdl === "number") {
          setQuote({
            status: "ok",
            totalMdl: body.totalSellPriceMdl,
            linearMeters: body.calculatedLinearMeters ?? 0,
            customerType: body.customerType ?? "retail",
          });
        } else {
          setQuote({ status: "error", code: body.code ?? "quote_failed" });
        }
      } catch {
        if (!cancelled) setQuote({ status: "error", code: "quote_failed" });
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [value.materialId, value.presetId, dimsValid, widthCm, heightCm, qty, pack]);

  useEffect(() => {
    const valid =
      !!value.materialId &&
      value.file != null &&
      dimsValid &&
      pack != null &&
      pack.ok &&
      quote.status === "ok";
    onStatus(itemId, {
      active,
      valid,
      priceMdl: valid && quote.status === "ok" ? quote.totalMdl : null,
    });
  }, [itemId, active, value.materialId, value.file, dimsValid, pack, quote, onStatus]);

  const section = (
    <LargeFormatSection
      materials={materials}
      material={material}
      value={value}
      onChange={onChange}
      pack={pack}
      quote={quote}
      t={t}
    />
  );

  if (!onRemove) return section;

  return (
    <div className="space-y-2 rounded-xl border border-gray-200 p-3 sm:p-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel}
          title={removeLabel}
          className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {section}
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

/** Maps a server/preview LF error code to a localized inline message. */
function lfErrorMessage(
  code: string | undefined,
  t: TranslationDictionary,
): string | null {
  if (!code) return null;
  switch (code) {
    case "lf_pack_does_not_fit":
      return t.cabinet.newOrder.lfDoesNotFit;
    case "lf_pack_quantity_too_large":
      return t.cabinet.newOrder.lfQuantityTooLarge;
    case "large_format_requires_login":
    case "lines_require_login":
      return t.cabinet.newOrder.lfRequiresLogin;
    default:
      return null;
  }
}

/**
 * Large-format roll printing section. Customer picks a material + size (preset
 * or custom) + quantity; we render a live roll-pack preview and a debounced
 * server price quote (tier resolved server-side). The artwork file is uploaded
 * on submit. Cost/margin details are intentionally never shown — only the final
 * sell price.
 */
function LargeFormatSection({
  materials,
  material,
  value,
  onChange,
  pack,
  quote,
  t,
}: {
  materials: PublicLargeFormatMaterial[];
  material: PublicLargeFormatMaterial | null;
  value: LfFormValue;
  onChange: (next: LfFormValue) => void;
  pack: LargeFormatRollPackResult | null;
  quote: LfQuoteState;
  t: TranslationDictionary;
}) {
  const tt = t.cabinet.newOrder;
  const currency = t.admin.currency;
  const presets = material?.sizePresets ?? [];
  const dimsLocked = value.presetId != null;

  const diagram =
    pack && pack.ok
      ? {
          printableWidthCm: pack.layout.printableWidthCm,
          totalAlongCm: pack.layout.totalAlongCm,
          placements: pack.layout.placements,
        }
      : undefined;

  if (materials.length === 0) {
    return (
      <Section label={tt.lfMaterialLabel}>
        <p className="text-sm text-gray-500">{tt.lfNoMaterials}</p>
      </Section>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,440px)_1fr]">
      <Section label={tt.lfMaterialLabel}>
        <div
          role="radiogroup"
          aria-label={tt.lfMaterialLabel}
          className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2.5 xl:grid-cols-2"
        >
          {materials.map((m) => (
            <LfMaterialCard
              key={m.id}
              selected={m.id === value.materialId}
              onClick={() =>
                onChange({ ...value, materialId: m.id, presetId: null })
              }
              name={m.name}
              rateLabel={`${formatAmountMdl(m.sellPricePerLinearMeter, currency)} ${tt.lfPerLinearMeter}`}
            />
          ))}
        </div>
      </Section>

      <div className="min-w-0 space-y-4">
        <Section label={tt.lfSizeLabel}>
          {presets.length > 0 ? (
            <div className="mb-3 flex flex-wrap gap-2">
              {presets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={value.presetId === p.id}
                  onClick={() =>
                    onChange({
                      ...value,
                      presetId: p.id,
                      widthStr: String(p.widthCm),
                      heightStr: String(p.heightCm),
                    })
                  }
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    value.presetId === p.id
                      ? "border-gold bg-amber-50 text-amber-950"
                      : "border-gray-200 bg-white text-gray-700 hover:border-gray-300",
                  )}
                >
                  {p.widthCm}×{p.heightCm}{" "}
                  <span className="tabular-nums text-gold">
                    · {formatAmountMdl(p.priceMdl, currency)}
                  </span>
                </button>
              ))}
              <button
                type="button"
                aria-pressed={value.presetId == null}
                onClick={() => onChange({ ...value, presetId: null })}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  value.presetId == null
                    ? "border-gold bg-amber-50 text-amber-950"
                    : "border-gray-200 bg-white text-gray-700 hover:border-gray-300",
                )}
              >
                {tt.lfPresetCustom}
              </button>
            </div>
          ) : null}

          <div className="grid grid-cols-3 gap-2.5">
            <NumberField
              label={tt.lfWidthLabel}
              value={value.widthStr}
              readOnly={dimsLocked}
              onChange={(widthStr) => onChange({ ...value, widthStr })}
            />
            <NumberField
              label={tt.lfHeightLabel}
              value={value.heightStr}
              readOnly={dimsLocked}
              onChange={(heightStr) => onChange({ ...value, heightStr })}
            />
            <NumberField
              label={tt.lfQuantityLabel}
              value={value.quantityStr}
              min={1}
              step={1}
              onChange={(quantityStr) => onChange({ ...value, quantityStr })}
            />
          </div>

          <LfRollPackPreview
            title={tt.lfPreviewTitle}
            emptyHint={tt.lfPreviewEmpty}
            diagram={diagram}
          />

          {pack && !pack.ok ? (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              {pack.code === "quantity_too_large"
                ? tt.lfQuantityTooLarge
                : tt.lfDoesNotFit}
            </p>
          ) : null}
        </Section>

        <Section label={tt.lfEstimatedPrice}>
          <LfPriceBlock quote={quote} currency={currency} t={t} />
        </Section>

        <Section label={tt.lfUploadLabel}>
          <FileDropzone
            onFiles={(files) => onChange({ ...value, file: files[0] ?? null })}
            ariaLabel={tt.lfUploadLabel}
            className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50/40 px-4 py-6 text-center transition-colors hover:border-amber-300 hover:bg-amber-50/30"
            dragActiveClassName="border-amber-300 bg-amber-50/30"
          >
            <Upload className="h-5 w-5 text-gray-500" />
            <span className="text-xs font-medium text-gray-700">
              {value.file ? tt.lfFileChosen(value.file.name) : tt.lfUploadHint}
            </span>
          </FileDropzone>
        </Section>
      </div>
    </div>
  );
}

/** Single large-format material card: name + per-linear-meter sell rate. */
function LfMaterialCard({
  selected,
  onClick,
  name,
  rateLabel,
}: {
  selected: boolean;
  onClick: () => void;
  name: string;
  rateLabel: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      title={name}
      className={cn(
        "flex flex-col gap-0.5 rounded-xl border-2 bg-white px-3 py-2.5 text-left transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold",
        selected
          ? "border-gold ring-1 ring-gold/25 shadow-sm"
          : "border-gray-200 hover:border-gray-300",
      )}
    >
      <span className="line-clamp-2 text-xs font-medium leading-tight text-gray-900">
        {name}
      </span>
      <span className="text-[11px] font-semibold tabular-nums text-gold">
        {rateLabel}
      </span>
    </button>
  );
}

/** Small labelled numeric input used by the LF size row. */
function NumberField({
  label,
  value,
  onChange,
  readOnly,
  min,
  step,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  min?: number;
  step?: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
        {label}
      </span>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        readOnly={readOnly}
        min={min}
        step={step}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm shadow-sm",
          "focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold",
          readOnly && "cursor-not-allowed bg-gray-50 text-gray-500",
        )}
      />
    </label>
  );
}

/** Final-price display for the LF line (loading / ok / error states). */
function LfPriceBlock({
  quote,
  currency,
  t,
}: {
  quote: LfQuoteState;
  currency: string;
  t: TranslationDictionary;
}) {
  const tt = t.cabinet.newOrder;
  if (quote.status === "loading") {
    return (
      <p className="flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
      </p>
    );
  }
  if (quote.status === "error") {
    return (
      <p className="text-sm text-red-700">
        {lfErrorMessage(quote.code, t) ?? tt.submitFailed}
      </p>
    );
  }
  if (quote.status === "ok") {
    return (
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-xl font-bold tabular-nums text-gray-900">
          {formatAmountMdl(quote.totalMdl, currency)}
        </span>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
          {quote.customerType === "dealer" ? tt.lfTierDealer : tt.lfTierRetail}
        </span>
        <span className="text-xs text-gray-500">
          {tt.lfLinearMeters(quote.linearMeters)}
        </span>
      </div>
    );
  }
  return <p className="text-sm text-gray-400">{tt.lfPreviewEmpty}</p>;
}

/** Thumbnail shown in the per-row SKU select (catalog photo or color swatch). */
function skuOptionThumb(
  imageUrl: string | null,
  fallbackBg: string,
): ReactNode {
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-gray-200 bg-gray-50"
      style={imageUrl ? undefined : { backgroundColor: fallbackBg }}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="h-full w-full object-contain" />
      ) : null}
    </span>
  );
}

/** Secondary line for a SKU option: "SKU · 80.00 MDL". */
function skuOptionDescription(
  sku: string,
  price: number | null,
  currency: string,
): string {
  return price != null
    ? `${sku} · ${formatAmountMdl(price, currency)}`
    : sku;
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
