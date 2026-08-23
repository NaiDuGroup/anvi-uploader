"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { FileDropzone } from "@/components/upload/FileDropzone";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { exportCanvasAsBlob, blobToFile } from "@/lib/mug/exportLayout";
import {
  getImageDimensions,
  validateLayoutSize,
  type SizeValidationResult,
} from "@/lib/imageDimensions";
import { cmToPx } from "@/lib/printDimensions";
import { generatePreview } from "@/lib/generatePreview";
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
  type AdminPaperFileEntry,
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
  tabLargeFormat: string;
};

const TABS: TabConfig[] = [
  { id: "paper_print", Icon: FileText, label: "tabPaper" },
  { id: "mug", Icon: Coffee, label: "tabMug" },
  { id: "notebook", Icon: BookOpen, label: "tabNotebook" },
  { id: "large_format_print", Icon: Maximize, label: "tabLargeFormat" },
];

/** Local state for a large-format position. */
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

/**
 * One order position ("линия заказа"). Every position keeps a private copy of
 * all four product sub-states so switching the product type back and forth
 * never loses what the user already configured — the same behaviour the old
 * single-position tabs had, now scoped per card.
 */
type Position = {
  id: string;
  productType: ProductType;
  /** The originally dropped file (used to seed sub-states on type switch). */
  sourceFile: File | null;
  paper: PaperFormValue;
  mug: MugFormValue;
  notebook: NotebookFormValue;
  lf: LfFormValue;
};

/** Per-position validity + optional client-side price estimate (MDL). */
type PositionStatus = { valid: boolean; priceMdl: number | null };

function newPosition(partial?: Partial<Position>): Position {
  return {
    id: crypto.randomUUID(),
    productType: "paper_print",
    sourceFile: null,
    paper: EMPTY_PAPER_VALUE,
    // Dealers mostly upload ready-made layouts, so mug/notebook positions
    // default to upload mode; the toggle switches into the editor.
    mug: { ...EMPTY_MUG_VALUE, mode: "upload" },
    notebook: { ...EMPTY_NOTEBOOK_VALUE, mode: "upload" },
    lf: EMPTY_LF_VALUE,
    ...partial,
  };
}

/** Builds a paper file entry (preview + PDF page count) like PaperOrderForm does. */
async function paperEntryFromFile(file: File): Promise<AdminPaperFileEntry> {
  let pageCount: number | undefined;
  if (file.type === "application/pdf") {
    try {
      const { PDFDocument } = await import("pdf-lib");
      const buf = await file.arrayBuffer();
      const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
      pageCount = doc.getPageCount();
    } catch {
      /* non-countable PDF */
    }
  }
  const previewUrl = await generatePreview(file);
  return {
    file,
    copies: 1,
    color: "bw",
    paperType: "A4",
    pageCount,
    previewUrl,
  };
}

/**
 * Turns a dropped file into a position. Images whose pixel size matches a
 * catalog mug/notebook print area (same ±2% tolerance the forms use) are
 * pre-assigned to that product with the SKU selected; everything else starts
 * as a paper-print position.
 */
async function positionFromFile(
  file: File,
  mugItems: MugProductOption[],
  notebookItems: NotebookProductOption[],
): Promise<Position> {
  if (file.type.startsWith("image/")) {
    try {
      const dims = await getImageDimensions(file);
      const mugMatch = mugItems.find((p) =>
        validateLayoutSize(dims, {
          width: cmToPx(p.printWidthCm, p.printDpi),
          height: cmToPx(p.printHeightCm, p.printDpi),
        }).ok,
      );
      if (mugMatch) {
        return newPosition({
          productType: "mug",
          sourceFile: file,
          mug: {
            ...EMPTY_MUG_VALUE,
            mode: "upload",
            selection: { type: "catalog", productId: mugMatch.id },
            customLayoutFile: file,
            customLayoutUrl: URL.createObjectURL(file),
          },
        });
      }
      const nbMatch = notebookItems.find((p) =>
        validateLayoutSize(dims, {
          width: cmToPx(p.printWidthCm, p.printDpi),
          height: cmToPx(p.printHeightCm, p.printDpi),
        }).ok,
      );
      if (nbMatch) {
        return newPosition({
          productType: "notebook",
          sourceFile: file,
          notebook: {
            ...EMPTY_NOTEBOOK_VALUE,
            mode: "upload",
            selection: { type: "catalog", productId: nbMatch.id },
            customLayoutFile: file,
            customLayoutUrl: URL.createObjectURL(file),
          },
        });
      }
    } catch {
      /* undecodable image — treat as generic paper file */
    }
  }
  return newPosition({
    productType: "paper_print",
    sourceFile: file,
    paper: { ...EMPTY_PAPER_VALUE, files: [await paperEntryFromFile(file)] },
  });
}

/** Frees blob URLs owned by a removed position. */
function revokePositionBlobUrls(pos: Position): void {
  for (const entry of pos.paper.files) {
    if (entry.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(entry.previewUrl);
  }
  if (pos.mug.customLayoutUrl?.startsWith("blob:")) {
    URL.revokeObjectURL(pos.mug.customLayoutUrl);
  }
  if (pos.notebook.customLayoutUrl?.startsWith("blob:")) {
    URL.revokeObjectURL(pos.notebook.customLayoutUrl);
  }
  for (const url of [...pos.mug.photos, ...pos.notebook.photos]) {
    if (url.startsWith("blob:")) URL.revokeObjectURL(url);
  }
}

/**
 * Seeds the sub-state of the newly selected product type with the position's
 * source file (when that sub-state has no file yet). Paper seeding is async
 * (preview generation) and handled separately by the caller.
 */
function seedPositionForType(pos: Position, type: ProductType): Position {
  const src = pos.sourceFile;
  if (!src) return pos;
  if (
    type === "mug" &&
    pos.mug.customLayoutFile == null &&
    src.type.startsWith("image/")
  ) {
    return {
      ...pos,
      mug: {
        ...pos.mug,
        mode: "upload",
        customLayoutFile: src,
        customLayoutUrl: URL.createObjectURL(src),
      },
    };
  }
  if (
    type === "notebook" &&
    pos.notebook.customLayoutFile == null &&
    src.type.startsWith("image/")
  ) {
    return {
      ...pos,
      notebook: {
        ...pos.notebook,
        mode: "upload",
        customLayoutFile: src,
        customLayoutUrl: URL.createObjectURL(src),
      },
    };
  }
  if (type === "large_format_print" && pos.lf.file == null) {
    return { ...pos, lf: { ...pos.lf, file: src } };
  }
  return pos;
}

/**
 * Multi-position order builder for the customer cabinet.
 *
 * The page is organised around a big drag-and-drop zone: every dropped file
 * becomes its own position card where the customer picks the product (paper /
 * mug / notebook / large format) and its settings. Positions without a file
 * (mug/notebook designed in the editor) are added via the "add position"
 * button. Submission posts `lines[]` to `POST /api/orders`, which creates one
 * `OrderLine` per position (phone, client and pricing tier are resolved
 * server-side from the cabinet session).
 */
export default function CabinetNewOrderClient({
  viewer,
}: {
  viewer: CabinetViewer;
}) {
  const router = useRouter();
  const { t } = useLanguageStore();
  const tt = t.cabinet.newOrder;

  const { items: rawMugItems } = usePublicMugProducts();
  const mugProductItems = rawMugItems as MugProductOption[];
  const { items: rawNotebookItems } = usePublicNotebookProducts();
  const notebookProductItems = rawNotebookItems as NotebookProductOption[];
  const { items: lfMaterials } = usePublicLargeFormatMaterials();

  const [positions, setPositions] = useState<Position[]>([]);
  const [statuses, setStatuses] = useState<Record<string, PositionStatus>>({});
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<SubmitFailure | null>(null);

  const mugFormRefs = useRef(new Map<string, MugOrderFormHandle | null>());
  const notebookFormRefs = useRef(new Map<string, NotebookOrderFormHandle | null>());

  const patchPosition = useCallback(
    (id: string, updater: (prev: Position) => Position) => {
      setPositions((prev) => prev.map((p) => (p.id === id ? updater(p) : p)));
    },
    [],
  );

  const removePosition = useCallback((id: string) => {
    setPositions((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) revokePositionBlobUrls(target);
      return prev.filter((p) => p.id !== id);
    });
    setStatuses((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    mugFormRefs.current.delete(id);
    notebookFormRefs.current.delete(id);
  }, []);

  const reportStatus = useCallback((id: string, status: PositionStatus) => {
    setStatuses((prev) => {
      const cur = prev[id];
      if (cur && cur.valid === status.valid && cur.priceMdl === status.priceMdl) {
        return prev;
      }
      return { ...prev, [id]: status };
    });
  }, []);

  const addDroppedFiles = useCallback(
    async (files: File[]) => {
      const created: Position[] = [];
      for (const file of files) {
        created.push(
          await positionFromFile(file, mugProductItems, notebookProductItems),
        );
      }
      setPositions((prev) => [...prev, ...created]);
    },
    [mugProductItems, notebookProductItems],
  );

  const addEmptyPosition = useCallback(() => {
    setPositions((prev) => [...prev, newPosition()]);
  }, []);

  const canSubmit =
    positions.length > 0 &&
    positions.every((p) => statuses[p.id]?.valid === true);

  // Shown only when every position has a client-side price estimate — a
  // partial sum would mislead. The server remains authoritative.
  const estimatedTotal = useMemo<number | null>(() => {
    if (positions.length === 0) return null;
    let sum = 0;
    for (const p of positions) {
      const price = statuses[p.id]?.priceMdl;
      if (price == null) return null;
      sum += price;
    }
    return sum;
  }, [positions, statuses]);

  async function buildLine(pos: Position): Promise<Record<string, unknown>> {
    if (pos.productType === "paper_print") {
      const copies = parseAdminCopiesInput(pos.paper.copiesStr);
      if (pos.paper.files.length === 0 || copies === null) {
        throw new Error("Invalid file list / copies");
      }
      const fileData = await Promise.all(
        pos.paper.files.map(async (entry) => {
          const upload = await uploadFile(entry.file);
          const resolvedPaper =
            pos.paper.paperType === "other" &&
            pos.paper.customWidth.trim() &&
            pos.paper.customHeight.trim()
              ? `other:${pos.paper.customWidth.trim()}x${pos.paper.customHeight.trim()}`
              : pos.paper.paperType;
          return {
            fileName: upload.fileName,
            fileUrl: upload.fileUrl,
            copies,
            color: pos.paper.color,
            paperType: resolvedPaper,
            pageCount: entry.pageCount,
          };
        }),
      );
      return { productType: "paper_print", files: fileData };
    }

    if (pos.productType === "mug") {
      const mugCopies = parseAdminCopiesInput(pos.mug.copiesStr);
      if (mugCopies === null) throw new Error("Invalid copies");

      const mugOther = pos.mug.selection?.type === "other";
      const mugCatId =
        pos.mug.selection?.type === "catalog" ? pos.mug.selection.productId : null;

      let mugFile: File;
      let mugLayoutData: MugLayoutData | undefined;

      if (pos.mug.mode === "upload") {
        if (!pos.mug.customLayoutFile) throw new Error("No layout file");
        mugFile = pos.mug.customLayoutFile;
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
        const canvas = mugFormRefs.current.get(pos.id)?.getCanvas();
        if (!canvas) throw new Error("Canvas not available");

        const photoFileKeys = await Promise.all(pos.mug.photos.map(uploadPhotoUrl));

        mugLayoutData = {
          templateId: pos.mug.template.id,
          text: pos.mug.text,
          fontFamily: pos.mug.fontFamily,
          textColor: pos.mug.textColor,
          backgroundColor: pos.mug.backgroundColor,
          photoUrls: photoFileKeys,
          photoSettings: pos.mug.photoSettings,
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
        files: [{ fileName, fileUrl, copies: mugCopies, color: "color" }],
      };
    }

    if (pos.productType === "notebook") {
      const notebookCopies = parseAdminCopiesInput(pos.notebook.copiesStr);
      if (notebookCopies === null) throw new Error("Invalid copies");

      const notebookOther = pos.notebook.selection?.type === "other";
      const notebookCatId =
        pos.notebook.selection?.type === "catalog"
          ? pos.notebook.selection.productId
          : null;

      let notebookFile: File;
      let notebookLayoutData: NotebookLayoutData | undefined;

      if (pos.notebook.mode === "upload") {
        if (!pos.notebook.customLayoutFile) throw new Error("No layout file");
        notebookFile = pos.notebook.customLayoutFile;
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
        const canvas = notebookFormRefs.current.get(pos.id)?.getCanvas();
        if (!canvas) throw new Error("Canvas not available");

        const photoFileKeys = await Promise.all(
          pos.notebook.photos.map(uploadPhotoUrl),
        );

        notebookLayoutData = {
          templateId: pos.notebook.template.id,
          text: pos.notebook.text,
          fontFamily: pos.notebook.fontFamily,
          textColor: pos.notebook.textColor,
          backgroundColor: pos.notebook.backgroundColor,
          photoUrls: photoFileKeys,
          photoSettings: pos.notebook.photoSettings,
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
        files: [{ fileName, fileUrl, copies: notebookCopies, color: "color" }],
      };
    }

    // Large format
    const lfWidthCm = Number.parseFloat(pos.lf.widthStr);
    const lfHeightCm = Number.parseFloat(pos.lf.heightStr);
    const lfQty = Number.parseInt(pos.lf.quantityStr, 10);
    if (!pos.lf.materialId) throw new Error("No material selected");
    if (!pos.lf.file) throw new Error("No print file");
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

    const { fileName, fileUrl } = await uploadFile(pos.lf.file);

    return {
      productType: "large_format_print",
      largeFormatMaterialId: pos.lf.materialId,
      printWidthCm: lfWidthCm,
      printHeightCm: lfHeightCm,
      quantity: lfQty,
      lfSizePresetId: pos.lf.presetId ?? null,
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
      for (const pos of positions) {
        lines.push(await buildLine(pos));
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

  const tabLabels: CabinetNewOrderTranslations = {
    tabPaper: tt.tabPaper,
    tabMug: tt.tabMug,
    tabNotebook: tt.tabNotebook,
    tabLargeFormat: tt.tabLargeFormat,
  };

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

      {/* Main dropzone: every dropped file becomes its own position. */}
      <FileDropzone
        multiple
        onFiles={(files) => void addDroppedFiles(files)}
        ariaLabel={tt.dropzoneTitle}
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-300 bg-white px-4 py-8 text-center shadow-sm transition-colors hover:border-gold hover:bg-gold-light/20"
        dragActiveClassName="border-gold bg-gold-light/30"
      >
        <Upload className="h-8 w-8 text-gray-400" />
        <p className="text-sm font-semibold text-gray-800">{tt.dropzoneTitle}</p>
        <p className="text-xs text-gray-500">{tt.dropzoneHint}</p>
      </FileDropzone>

      {positions.length > 0 ? (
        <div className="space-y-4">
          {positions.map((pos, i) => (
            <PositionCard
              key={pos.id}
              index={i}
              position={pos}
              labels={tabLabels}
              mugItems={mugProductItems}
              notebookItems={notebookProductItems}
              lfMaterials={lfMaterials}
              onPatch={patchPosition}
              onRemove={removePosition}
              onStatus={reportStatus}
              registerMugRef={(h) => mugFormRefs.current.set(pos.id, h)}
              registerNotebookRef={(h) => notebookFormRefs.current.set(pos.id, h)}
              t={t}
            />
          ))}
        </div>
      ) : null}

      <Button
        type="button"
        variant="outline"
        onClick={addEmptyPosition}
        className="w-full border-dashed sm:w-auto"
      >
        <Plus className="h-4 w-4" />
        {tt.addPosition}
      </Button>

      {/* Order-level footer: summary, notes, submit. */}
      <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span className="font-medium text-gray-700">
            {tt.positionsSummary(positions.length)}
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

/** One position card: header (number, file, type picker, remove) + body. */
function PositionCard({
  index,
  position,
  labels,
  mugItems,
  notebookItems,
  lfMaterials,
  onPatch,
  onRemove,
  onStatus,
  registerMugRef,
  registerNotebookRef,
  t,
}: {
  index: number;
  position: Position;
  labels: CabinetNewOrderTranslations;
  mugItems: MugProductOption[];
  notebookItems: NotebookProductOption[];
  lfMaterials: PublicLargeFormatMaterial[];
  onPatch: (id: string, updater: (prev: Position) => Position) => void;
  onRemove: (id: string) => void;
  onStatus: (id: string, status: PositionStatus) => void;
  registerMugRef: (handle: MugOrderFormHandle | null) => void;
  registerNotebookRef: (handle: NotebookOrderFormHandle | null) => void;
  t: TranslationDictionary;
}) {
  const tt = t.cabinet.newOrder;
  const id = position.id;

  const handleTypeChange = (type: ProductType) => {
    if (type === position.productType) return;
    onPatch(id, (prev) => seedPositionForType({ ...prev, productType: type }, type));
    // Paper seeding needs the async preview; patch again once ready.
    if (type === "paper_print" && position.sourceFile && position.paper.files.length === 0) {
      const src = position.sourceFile;
      void paperEntryFromFile(src).then((entry) => {
        onPatch(id, (prev) =>
          prev.paper.files.length === 0
            ? { ...prev, paper: { ...prev.paper, files: [entry] } }
            : prev,
        );
      });
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center gap-2 border-b border-gray-100 bg-gray-50/60 px-3 py-2.5 sm:px-4">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold/15 text-xs font-bold text-gold-dark">
          {index + 1}
        </span>
        <span
          className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900"
          title={position.sourceFile?.name ?? tt.positionLabel(index + 1)}
        >
          {position.sourceFile?.name ?? tt.positionLabel(index + 1)}
        </span>
        <PositionTypePicker
          active={position.productType}
          onSelect={handleTypeChange}
          labels={labels}
        />
        <button
          type="button"
          onClick={() => onRemove(id)}
          aria-label={tt.removePosition}
          title={tt.removePosition}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </header>

      <div className="space-y-4 p-3 sm:p-4">
        {position.productType === "paper_print" && (
          <PaperPositionBody
            positionId={id}
            value={position.paper}
            onChange={(next) => onPatch(id, (prev) => ({ ...prev, paper: next }))}
            onStatus={onStatus}
            t={t}
          />
        )}

        {position.productType === "mug" && (
          <MugPositionBody
            positionId={id}
            value={position.mug}
            items={mugItems}
            onChange={(next) =>
              onPatch(id, (prev) => ({
                ...prev,
                mug: typeof next === "function" ? next(prev.mug) : next,
              }))
            }
            onStatus={onStatus}
            registerRef={registerMugRef}
            t={t}
          />
        )}

        {position.productType === "notebook" && (
          <NotebookPositionBody
            positionId={id}
            value={position.notebook}
            items={notebookItems}
            onChange={(next) =>
              onPatch(id, (prev) => ({
                ...prev,
                notebook: typeof next === "function" ? next(prev.notebook) : next,
              }))
            }
            onStatus={onStatus}
            registerRef={registerNotebookRef}
            t={t}
          />
        )}

        {position.productType === "large_format_print" && (
          <LfPositionBody
            positionId={id}
            value={position.lf}
            materials={lfMaterials}
            onChange={(next) => onPatch(id, (prev) => ({ ...prev, lf: next }))}
            onStatus={onStatus}
            t={t}
          />
        )}
      </div>
    </section>
  );
}

/** Paper position: shared PaperOrderForm + validity reporting. */
function PaperPositionBody({
  positionId,
  value,
  onChange,
  onStatus,
  t,
}: {
  positionId: string;
  value: PaperFormValue;
  onChange: (next: PaperFormValue) => void;
  onStatus: (id: string, status: PositionStatus) => void;
  t: TranslationDictionary;
}) {
  useEffect(() => {
    const copies = parseAdminCopiesInput(value.copiesStr);
    onStatus(positionId, {
      valid: value.files.length > 0 && copies !== null,
      priceMdl: null,
    });
  }, [positionId, value.files.length, value.copiesStr, onStatus]);

  return <PaperOrderForm value={value} onChange={onChange} t={t} />;
}

/** Mug position: mode toggle + SKU grid + shared MugOrderForm. */
function MugPositionBody({
  positionId,
  value,
  items,
  onChange,
  onStatus,
  registerRef,
  t,
}: {
  positionId: string;
  value: MugFormValue;
  items: MugProductOption[];
  onChange: (next: MugFormValue | ((prev: MugFormValue) => MugFormValue)) => void;
  onStatus: (id: string, status: PositionStatus) => void;
  registerRef: (handle: MugOrderFormHandle | null) => void;
  t: TranslationDictionary;
}) {
  const [validation, setValidation] = useState<SizeValidationResult | null>(null);

  // Auto-select first SKU once the catalog loads (mirrors admin behaviour).
  useEffect(() => {
    if (value.selection?.type === "catalog" || value.selection?.type === "other") {
      return;
    }
    if (items.length === 0) {
      onChange((prev) =>
        prev.selection ? prev : { ...prev, selection: { type: "other" } },
      );
      return;
    }
    onChange((prev) =>
      prev.selection
        ? prev
        : { ...prev, selection: { type: "catalog", productId: items[0]!.id } },
    );
  }, [items, value.selection, onChange]);

  useEffect(() => {
    const copies = parseAdminCopiesInput(value.copiesStr);
    const chosen =
      value.selection != null &&
      (value.selection.type === "other" ||
        (value.selection.type === "catalog" && !!value.selection.productId));
    let valid = chosen && copies !== null;
    if (valid) {
      if (value.mode === "upload") {
        valid =
          value.customLayoutFile != null && !(validation && !validation.ok);
      } else {
        valid = value.photos.length > 0;
      }
    }
    const selection = value.selection;
    const item =
      selection?.type === "catalog"
        ? items.find((i) => i.id === selection.productId)
        : undefined;
    const priceMdl =
      valid && item?.sellPrice != null && copies != null
        ? item.sellPrice * copies
        : null;
    onStatus(positionId, { valid, priceMdl });
  }, [positionId, value, validation, items, onStatus]);

  return (
    <>
      <div className="flex justify-end">
        <ModeToggle
          mode={value.mode}
          onChange={(mode) =>
            onChange((prev) => (prev.mode === mode ? prev : { ...prev, mode }))
          }
          editorLabel={t.mug.mugModeEditor}
          uploadLabel={t.mug.mugModeUpload}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,440px)_1fr]">
        <MugSkuSection
          label={t.admin.mugProductPickLabel}
          items={items}
          value={value.selection}
          onChange={(selection) => onChange((prev) => ({ ...prev, selection }))}
          otherLabel={t.admin.mugProductOtherLabel}
        />
        <div className="min-w-0">
          <MugOrderForm
            ref={registerRef}
            value={value}
            onChange={onChange}
            productItems={items}
            t={t}
            hideProductPicker
            singleColumn
            onUploadValidationChange={setValidation}
          />
        </div>
      </div>
    </>
  );
}

/** Notebook position: mirror of {@link MugPositionBody}. */
function NotebookPositionBody({
  positionId,
  value,
  items,
  onChange,
  onStatus,
  registerRef,
  t,
}: {
  positionId: string;
  value: NotebookFormValue;
  items: NotebookProductOption[];
  onChange: (
    next: NotebookFormValue | ((prev: NotebookFormValue) => NotebookFormValue),
  ) => void;
  onStatus: (id: string, status: PositionStatus) => void;
  registerRef: (handle: NotebookOrderFormHandle | null) => void;
  t: TranslationDictionary;
}) {
  const [validation, setValidation] = useState<SizeValidationResult | null>(null);

  useEffect(() => {
    if (value.selection?.type === "catalog" || value.selection?.type === "other") {
      return;
    }
    if (items.length === 0) {
      onChange((prev) =>
        prev.selection ? prev : { ...prev, selection: { type: "other" } },
      );
      return;
    }
    onChange((prev) =>
      prev.selection
        ? prev
        : { ...prev, selection: { type: "catalog", productId: items[0]!.id } },
    );
  }, [items, value.selection, onChange]);

  useEffect(() => {
    const copies = parseAdminCopiesInput(value.copiesStr);
    const chosen =
      value.selection != null &&
      (value.selection.type === "other" ||
        (value.selection.type === "catalog" && !!value.selection.productId));
    let valid = chosen && copies !== null;
    if (valid) {
      if (value.mode === "upload") {
        valid =
          value.customLayoutFile != null && !(validation && !validation.ok);
      } else {
        valid = value.photos.length > 0;
      }
    }
    const selection = value.selection;
    const item =
      selection?.type === "catalog"
        ? items.find((i) => i.id === selection.productId)
        : undefined;
    const priceMdl =
      valid && item?.sellPrice != null && copies != null
        ? item.sellPrice * copies
        : null;
    onStatus(positionId, { valid, priceMdl });
  }, [positionId, value, validation, items, onStatus]);

  return (
    <>
      <div className="flex justify-end">
        <ModeToggle
          mode={value.mode}
          onChange={(mode) =>
            onChange((prev) => (prev.mode === mode ? prev : { ...prev, mode }))
          }
          editorLabel={t.notebook.notebookModeEditor}
          uploadLabel={t.notebook.notebookModeUpload}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,440px)_1fr]">
        <NotebookSkuSection
          label={t.admin.notebookProductPickLabel}
          items={items}
          value={value.selection}
          onChange={(selection) => onChange((prev) => ({ ...prev, selection }))}
          otherLabel={t.admin.notebookProductOtherLabel}
        />
        <div className="min-w-0">
          <NotebookOrderForm
            ref={registerRef}
            value={value}
            onChange={onChange}
            productItems={items}
            t={t}
            hideProductPicker
            singleColumn
            onUploadValidationChange={setValidation}
          />
        </div>
      </div>
    </>
  );
}

/**
 * Large-format position: material + size + quantity + artwork, with a local
 * roll-pack preview and a debounced server price quote (tier resolved
 * server-side from the session).
 */
function LfPositionBody({
  positionId,
  value,
  materials,
  onChange,
  onStatus,
  t,
}: {
  positionId: string;
  value: LfFormValue;
  materials: PublicLargeFormatMaterial[];
  onChange: (next: LfFormValue) => void;
  onStatus: (id: string, status: PositionStatus) => void;
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
    onStatus(positionId, {
      valid,
      priceMdl: valid && quote.status === "ok" ? quote.totalMdl : null,
    });
  }, [positionId, value.materialId, value.file, dimsValid, pack, quote, onStatus]);

  return (
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
            {formatAmountMdl(price, currency)}
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

/** Compact per-position product-type picker (icon + label on sm+). */
function PositionTypePicker({
  active,
  onSelect,
  labels,
}: {
  active: ProductType;
  onSelect: (id: ProductType) => void;
  labels: CabinetNewOrderTranslations;
}) {
  return (
    <div
      role="tablist"
      aria-label="Product type"
      className="inline-flex rounded-full border border-gray-200 bg-gray-100 p-0.5 text-xs font-medium"
    >
      {TABS.map((tab) => {
        const Icon = tab.Icon;
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(tab.id)}
            title={labels[tab.label]}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 transition-colors",
              isActive
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-900",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden md:inline">{labels[tab.label]}</span>
          </button>
        );
      })}
    </div>
  );
}
