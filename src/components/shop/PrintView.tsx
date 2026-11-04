"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { printLineTitle, printOptionsText } from "@/lib/shop/printLine";
import { newLineId, type CartLine } from "@/lib/storefront/cart";
import { dispatchCart, useCart, useHydrated } from "@/lib/storefront/cartStore";
import { formatPrice } from "@/lib/storefront/format";
import type { ShopT } from "@/lib/storefront/i18n";
import {
  countPdfPages,
  formatFileSize,
  isBigPrintFile,
  printDocThumbUrl,
  printFileKind,
  PRINT_ACCEPT,
  type PrintFileKind,
} from "@/lib/storefront/printFiles";
import {
  docUnitPrice,
  photoDpi,
  photoLowRes,
  photoSizeText,
  shopPhotoSize,
  shopPrintPrice,
  SHOP_DOC_FORMATS,
  SHOP_PHOTO_DEFAULT_FINISH,
  SHOP_PHOTO_DEFAULT_SIZE,
  SHOP_PHOTO_FINISHES,
  SHOP_PHOTO_SIZES,
  SHOP_PRINT_MAX_COPIES,
  SHOP_PRINT_MAX_FILES,
  SHOP_PRINT_MAX_PAGES,
  SHOP_PRINT_SLUG,
  type ShopDocItem,
  type ShopPhotoItem,
  type ShopPrintMode,
  type ShopPrintQuote,
} from "@/lib/storefront/printPrices";
import { PRINT_ORIGIN } from "@/lib/storefront/shopHost";
import type { ShopFileRef } from "@/lib/storefront/types";
import { readImageSize, ShopUploadError, uploadArtwork } from "@/lib/storefront/upload";
import { AddedToast } from "./AddedToast";
import { QtyStepper } from "./ProductBits";
import { UploadIcon } from "./ShopIcons";
import { useShopLang } from "./ShopLangProvider";

/** Uploads running at once. */
const UPLOAD_CONCURRENCY = 3;

type DocOptions = Omit<ShopDocItem, "pages">;
type PhotoOptions = ShopPhotoItem;

const DOC_DEFAULTS: DocOptions = { format: "A4", color: "bw", sides: "one", copies: 1 };
const PHOTO_DEFAULTS: PhotoOptions = { size: SHOP_PHOTO_DEFAULT_SIZE, finish: SHOP_PHOTO_DEFAULT_FINISH, copies: 1 };

interface Entry {
  id: string;
  name: string;
  sizeBytes: number;
  kind: PrintFileKind;
  status: "queued" | "uploading" | "done" | "error";
  pct: number;
  error?: string;
  /** The picked file, kept for a retry (gone after a reload / in edit mode). */
  file?: File;
  ref?: ShopFileRef;
  /** Document pages: null = unknown (the customer types them). */
  pages: number | null;
  pagesState: "counting" | "auto" | "manual";
  px: { width: number; height: number } | null;
  thumb?: string;
  doc: DocOptions;
  photo: PhotoOptions;
}

type Lists = Record<ShopPrintMode, Entry[]>;

function entryId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Small JPEG of a photo (longest side 120 px) for the list and the cart. */
async function makeThumb(file: File): Promise<string | undefined> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("image"));
      i.src = url;
    });
    const s: number = Math.min(1, 120 / Math.max(img.naturalWidth, img.naturalHeight));
    const w: number = Math.max(1, Math.round(img.naturalWidth * s));
    const h: number = Math.max(1, Math.round(img.naturalHeight * s));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.7);
  } catch {
    return undefined;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The line's quote from the list; null while a document has no page count. */
function buildQuote(mode: ShopPrintMode, entries: readonly Entry[]): ShopPrintQuote | null {
  if (entries.length === 0) return null;
  if (mode === "doc") {
    if (entries.some((e) => e.pages == null)) return null;
    return { kind: "print", mode: "doc", items: entries.map((e) => ({ ...e.doc, pages: e.pages! })) };
  }
  return { kind: "print", mode: "photo", items: entries.map((e) => ({ ...e.photo })) };
}

function initialLists(editLine: CartLine | null): { mode: ShopPrintMode; lists: Lists } {
  const lists: Lists = { doc: [], photo: [] };
  const q = editLine?.quote.kind === "print" ? editLine.quote : null;
  if (!q || !editLine) return { mode: "doc", lists };
  lists[q.mode] = q.items.map((item, i): Entry => {
    const ref = editLine.files[i];
    const px = ref?.pixelWidth && ref.pixelHeight ? { width: ref.pixelWidth, height: ref.pixelHeight } : null;
    const name: string = ref?.fileName ?? `#${i + 1}`;
    return {
      id: entryId(),
      name,
      sizeBytes: ref?.sizeBytes ?? 0,
      kind: q.mode === "photo" ? "image" : (printFileKind({ name }, "doc") ?? "pdf"),
      status: ref ? "done" : "error",
      pct: 100,
      ...(ref ? { ref } : {}),
      pages: q.mode === "doc" ? (item as ShopDocItem).pages : 1,
      pagesState: "manual",
      px,
      ...(ref?.thumb ? { thumb: ref.thumb } : {}),
      doc: q.mode === "doc" ? { ...DOC_DEFAULTS, ...(item as ShopDocItem) } : DOC_DEFAULTS,
      photo: q.mode === "photo" ? { ...(item as ShopPhotoItem) } : PHOTO_DEFAULTS,
    };
  });
  return { mode: q.mode, lists };
}

/**
 * «Printare foto și documente» (`/printare`): upload documents or photos,
 * options per file or for all, the page count read from PDFs, a resolution
 * warning per photo and the live price (`printPrices.ts` — the server
 * re-prices from the same list). With `editId` it edits that cart line.
 */
export function PrintView({ editId = null }: { editId?: string | null }) {
  const lines = useCart();
  const hydrated = useHydrated();
  const editLine: CartLine | null =
    editId && hydrated ? (lines.find((l) => l.id === editId && l.quote.kind === "print") ?? null) : null;
  return <PrintEditor key={editLine?.id ?? "new"} editLine={editLine} />;
}

function PrintEditor({ editLine }: { editLine: CartLine | null }) {
  const { t, lang, href, paymentLive } = useShopLang();
  const router = useRouter();
  const init = useMemo(() => initialLists(editLine), [editLine]);
  const [mode, setMode] = useState<ShopPrintMode>(init.mode);
  const [lists, setLists] = useState<Lists>(init.lists);
  const [docAll, setDocAll] = useState<DocOptions>(DOC_DEFAULTS);
  const [photoAll, setPhotoAll] = useState<PhotoOptions>(PHOTO_DEFAULTS);
  const [notice, setNotice] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const running = useRef(0);
  // Latest lists for the upload queue (callbacks outlive renders).
  const listsRef = useRef<Lists>(lists);
  useEffect(() => {
    listsRef.current = lists;
  }, [lists]);

  const entries: Entry[] = lists[mode];
  const patch = (m: ShopPrintMode, id: string, p: Partial<Entry>) =>
    setLists((s) => ({ ...s, [m]: s[m].map((e) => (e.id === id ? { ...e, ...p } : e)) }));
  const remove = (m: ShopPrintMode, id: string) => setLists((s) => ({ ...s, [m]: s[m].filter((e) => e.id !== id) }));

  /** Starts queued uploads up to the concurrency limit. */
  const pump = () => {
    for (const m of ["doc", "photo"] as const) {
      for (const e of listsRef.current[m]) {
        if (running.current >= UPLOAD_CONCURRENCY) return;
        if (e.status !== "queued" || !e.file) continue;
        running.current++;
        const file = e.file;
        // Mark it now so the next pass does not start it again.
        listsRef.current = { ...listsRef.current, [m]: listsRef.current[m].map((x) => (x.id === e.id ? { ...x, status: "uploading" } : x)) };
        patch(m, e.id, { status: "uploading", pct: 0 });
        uploadArtwork(file, (pct) => patch(m, e.id, { pct }))
          .then((ref) => patch(m, e.id, { status: "done", pct: 100, ref }))
          .catch((err: unknown) =>
            patch(m, e.id, {
              status: "error",
              error: err instanceof ShopUploadError && err.code === "too_big" ? t("uploadTooBig") : t("uploadFailed"),
            }),
          )
          .finally(() => {
            running.current--;
            pump();
          });
      }
    }
  };

  const addFiles = (picked: FileList | null) => {
    if (!picked?.length) return;
    const m: ShopPrintMode = mode;
    const room: number = SHOP_PRINT_MAX_FILES - listsRef.current[m].length;
    const all: File[] = Array.from(picked);
    const unsupported: string[] = [];
    const fresh: Entry[] = [];
    for (const file of all) {
      const kind = printFileKind(file, m);
      if (!kind) {
        unsupported.push(file.name);
        continue;
      }
      if (fresh.length >= room) continue;
      const bigPdf: boolean = kind === "pdf" && isBigPrintFile(file.size);
      fresh.push({
        id: entryId(),
        name: file.name,
        sizeBytes: file.size,
        kind,
        status: "queued",
        pct: 0,
        file,
        pages: kind === "image" ? 1 : null,
        pagesState: kind === "pdf" && !bigPdf ? "counting" : kind === "image" ? "auto" : "manual",
        px: null,
        doc: { ...docAll },
        photo: { ...photoAll },
      });
    }
    const skipped: number = all.length - unsupported.length - fresh.length;
    setNotice(
      [
        unsupported.length ? t("printUnsupported", { name: unsupported.slice(0, 3).join(", ") + (unsupported.length > 3 ? "…" : "") }) : null,
        skipped > 0 ? t("printTooMany", { n: SHOP_PRINT_MAX_FILES }) : null,
      ]
        .filter(Boolean)
        .join(" ") || null,
    );
    if (inputRef.current) inputRef.current.value = "";
    if (fresh.length === 0) return;
    listsRef.current = { ...listsRef.current, [m]: [...listsRef.current[m], ...fresh] };
    setLists(listsRef.current);
    setHint(null);
    // Facts read in the browser: PDF pages, photo pixels + thumbnail.
    for (const e of fresh) {
      const file = e.file!;
      if (e.pagesState === "counting") {
        void file
          .arrayBuffer()
          .then(countPdfPages)
          .catch(() => null)
          .then((pages) => patch(m, e.id, pages ? { pages, pagesState: "auto" } : { pagesState: "manual" }));
      }
      if (e.kind === "image") {
        void Promise.all([readImageSize(file), makeThumb(file)]).then(([px, thumb]) =>
          patch(m, e.id, { px, ...(thumb ? { thumb } : {}) }),
        );
      }
    }
    pump();
  };

  const retry = (id: string) => {
    const e = listsRef.current[mode].find((x) => x.id === id);
    if (!e?.file) return;
    patch(mode, id, { status: "queued", error: undefined, pct: 0 });
    listsRef.current = { ...listsRef.current, [mode]: listsRef.current[mode].map((x) => (x.id === id ? { ...x, status: "queued" } : x)) };
    pump();
  };

  const applyDocAll = (p: Partial<DocOptions>) => {
    setDocAll((d) => ({ ...d, ...p }));
    setLists((s) => ({ ...s, doc: s.doc.map((e) => ({ ...e, doc: { ...e.doc, ...p } })) }));
  };
  const applyPhotoAll = (p: Partial<PhotoOptions>) => {
    setPhotoAll((d) => ({ ...d, ...p }));
    setLists((s) => ({ ...s, photo: s.photo.map((e) => ({ ...e, photo: { ...e.photo, ...p } })) }));
  };

  const quote: ShopPrintQuote | null = buildQuote(mode, entries);
  const price = quote ? shopPrintPrice(quote) : null;
  // Per-file prices also while another document still has no page count.
  const itemPrice = (e: Entry): number | null => {
    const q = buildQuote(mode, [e]);
    return q ? (shopPrintPrice(q)?.total ?? null) : null;
  };
  const uploading: boolean = entries.some((e) => e.status === "queued" || e.status === "uploading");
  const failed: boolean = entries.some((e) => e.status === "error");
  const noPages: boolean = mode === "doc" && entries.some((e) => e.pages == null);

  const addToCart = () => {
    const problem: string | null =
      entries.length === 0
        ? t("printFilesRequired")
        : uploading
          ? t("printWaitUpload")
          : failed
            ? t("printUploadErrors")
            : noPages
              ? t("printPagesRequired")
              : null;
    if (problem || !quote || !price) {
      setHint(problem ?? t("printFilesRequired"));
      return;
    }
    // Client-only hints kept with the cart line (the checkout sends key, name and size only).
    const files: ShopFileRef[] = entries.map((e) => ({
      ...e.ref!,
      ...(e.thumb ? { thumb: e.thumb } : {}),
      ...(e.px ? { pixelWidth: e.px.width, pixelHeight: e.px.height } : {}),
      ...(mode === "doc" && e.pages ? { pages: e.pages } : {}),
      ...(mode === "photo" && photoLowRes(e.px, e.photo.size) ? { lowRes: true } : {}),
    }));
    const firstThumb: string | undefined = mode === "photo" ? entries.find((e) => e.thumb)?.thumb : undefined;
    const docLabel: string = entries[0]!.kind === "word" ? "DOC" : entries[0]!.kind === "image" ? "IMG" : "PDF";
    const line: CartLine = {
      id: editLine?.id ?? newLineId(),
      slug: SHOP_PRINT_SLUG,
      title: printLineTitle(quote, t),
      optionsText: printOptionsText(quote, t),
      image: firstThumb ?? printDocThumbUrl(mode === "photo" ? "IMG" : docLabel),
      quote,
      files,
      lastTotal: price.total,
      // Runs in the click handler, not during render.
      // eslint-disable-next-line react-hooks/purity
      addedAt: editLine?.addedAt ?? Date.now(),
    };
    setHint(null);
    if (editLine) {
      dispatchCart({ type: "update", line });
      router.push(href("/shop/cos"));
      return;
    }
    dispatchCart({ type: "add", line });
    // A new set starts empty (the options for all stay).
    setLists((s) => ({ ...s, [mode]: [] }));
    setAdded(true);
    window.setTimeout(() => setAdded(false), 4000);
  };

  const addLabel: string = editLine ? t("updateInCart") : t("addToCart");
  const total: number | null = price?.total ?? null;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1.25fr_1fr] lg:gap-12">
      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h1 className="m-0 text-[26px] leading-tight font-extrabold sm:text-4xl">{t("photoTileTitle")}</h1>
          <p className="m-0 text-base leading-relaxed text-(--muted)">{t("printIntro")}</p>
          <a href={PRINT_ORIGIN} className="self-start text-sm font-semibold underline">
            {t("printWalkIn")}
          </a>
          {editLine ? (
            <p role="status" className="m-0 rounded-xl bg-(--warn-soft) px-4 py-2.5 text-sm font-semibold text-(--warn)">
              {t("editingLine")}
            </p>
          ) : null}
        </div>

        <div className="flex gap-2" role="tablist" aria-label={t("photoTileTitle")}>
          {(["doc", "photo"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              disabled={!!editLine && editLine.quote.kind === "print" && editLine.quote.mode !== m}
              onClick={() => {
                setMode(m);
                setHint(null);
                setNotice(null);
              }}
              className={`min-h-11 flex-1 rounded-[10px] border-[1.5px] px-4 font-bold disabled:opacity-40 sm:flex-none ${
                mode === m ? "border-(--ink) bg-(--ink) text-white" : "border-(--line2) bg-white"
              }`}
            >
              {m === "doc" ? t("printModeDoc") : t("printModePhoto")}
              {lists[m].length ? ` · ${lists[m].length}` : ""}
            </button>
          ))}
        </div>

        <section aria-label={t("printApplyAll")} className="flex flex-col gap-3 rounded-[14px] border-[1.5px] border-(--line2) p-4">
          <b className="text-[15px]">{t("printApplyAll")}</b>
          {mode === "doc" ? (
            <DocOptionFields value={docAll} onChange={applyDocAll} t={t} idPrefix="all" />
          ) : (
            <PhotoOptionFields value={photoAll} onChange={applyPhotoAll} t={t} idPrefix="all" />
          )}
        </section>

        <div
          className="flex flex-col items-center gap-3 rounded-[14px] border-[1.5px] border-dashed border-(--line2) bg-(--soft) p-5 text-center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            addFiles(e.dataTransfer.files);
          }}
        >
          <span className="text-(--muted)">
            <UploadIcon size={28} />
          </span>
          <span className="text-sm leading-snug text-(--muted)">{mode === "doc" ? t("printDocDrop") : t("printPhotoDrop")}</span>
          <label
            htmlFor={inputId}
            className="shop-btn-dark inline-flex min-h-11 cursor-pointer items-center rounded-[10px] bg-(--ink) px-5 font-bold text-white focus-within:outline-2 focus-within:outline-(--ink)"
          >
            {t("printAddFiles")}
            <input
              ref={inputRef}
              id={inputId}
              type="file"
              multiple
              accept={PRINT_ACCEPT[mode]}
              className="sr-only"
              onChange={(e) => addFiles(e.target.files)}
            />
          </label>
          <span className="text-xs text-(--muted2)">{t("printFilesLimit", { n: SHOP_PRINT_MAX_FILES })}</span>
          {notice ? (
            <span role="alert" className="text-sm text-(--warn)">
              {notice}
            </span>
          ) : null}
        </div>

        {entries.length ? (
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <b className="text-[15px]">{t("printFilesN", { n: entries.length })}</b>
              <button
                type="button"
                onClick={() => setLists((s) => ({ ...s, [mode]: [] }))}
                className="min-h-10 px-1 text-sm font-semibold text-(--muted) underline"
              >
                {t("printRemoveAll")}
              </button>
            </div>
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {entries.map((e) => (
                <FileRow
                  key={e.id}
                  mode={mode}
                  entry={e}
                  price={itemPrice(e)}
                  onPatch={(p) => patch(mode, e.id, p)}
                  onRemove={() => remove(mode, e.id)}
                  onRetry={() => retry(e.id)}
                />
              ))}
            </ul>
          </div>
        ) : (
          <p className="m-0 text-sm text-(--muted2)">{t("printEmpty")}</p>
        )}
      </div>

      <div className="flex flex-col gap-5 lg:sticky lg:top-4">
        <div className="flex flex-col gap-3.5 rounded-2xl bg-(--soft) p-5">
          <div className="flex min-h-[64px] flex-col justify-center gap-1" aria-live="polite">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-(--muted)">{t("total")}</span>
              <span className="text-[30px] font-extrabold sm:text-[34px]">{total != null ? formatPrice(total, lang) : "—"}</span>
            </div>
            {quote ? <span className="self-end text-right text-sm text-(--muted2)">{printOptionsText(quote, t)}</span> : null}
            {hint ? (
              <span role="alert" className="text-sm font-semibold text-(--err)">
                {hint}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={addToCart}
            className="shop-btn-dark hidden rounded-xl bg-(--ink) py-4 text-[17px] font-extrabold disabled:opacity-50 md:block"
          >
            {added ? `✓ ${t("addedToCart")}` : addLabel}
          </button>
          <p aria-live="polite" className={`m-0 text-sm font-semibold ${added ? "" : "sr-only"}`}>
            {added ? (
              <>
                ✓ {t("addedToCart")} — <Link href={href("/shop/cos")}>{t("goToCart")}</Link>
              </>
            ) : null}
          </p>
          <div className="flex flex-col gap-2 text-sm text-(--muted)">
            <span>{t("readyIn")}</span>
            <span>{t("deliveryLine")}</span>
            <span>{paymentLive ? t("paymentLine") : t("paymentLineSoon")}</span>
          </div>
        </div>
        <PriceList mode={mode} t={t} lang={lang} />
      </div>

      <AddedToast show={added} />

      {/* Phone: sticky add-to-cart bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-(--line) bg-white px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] md:hidden">
        <button
          type="button"
          onClick={addToCart}
          className="shop-btn-dark min-h-12 flex-1 rounded-xl bg-(--ink) px-3 text-base font-extrabold disabled:opacity-50"
        >
          {added ? `✓ ${t("addedToCart")}` : editLine ? t("updateInCart") : t("addToCartShort")}
          {!added && total != null ? ` · ${formatPrice(total, lang)}` : ""}
        </button>
      </div>
    </div>
  );
}

const SELECT =
  "min-h-11 w-full rounded-[10px] border-[1.5px] border-(--line2) bg-white px-3 text-[15px] font-semibold";

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <label htmlFor={id} className="flex min-w-0 flex-col gap-1 text-sm">
      <span className="text-(--muted)">{label}</span>
      {children}
    </label>
  );
}

function DocOptionFields({
  value,
  onChange,
  t,
  idPrefix,
}: {
  value: DocOptions;
  onChange: (p: Partial<DocOptions>) => void;
  t: ShopT;
  idPrefix: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      <Field id={`${idPrefix}-format`} label={t("printFormat")}>
        <select
          id={`${idPrefix}-format`}
          className={SELECT}
          value={value.format}
          onChange={(e) => onChange({ format: e.target.value as DocOptions["format"] })}
        >
          {SHOP_DOC_FORMATS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </Field>
      <Field id={`${idPrefix}-color`} label={t("printColor")}>
        <select
          id={`${idPrefix}-color`}
          className={SELECT}
          value={value.color}
          onChange={(e) => onChange({ color: e.target.value as DocOptions["color"] })}
        >
          <option value="bw">{t("printBw")}</option>
          <option value="color">{t("printColorOpt")}</option>
        </select>
      </Field>
      <Field id={`${idPrefix}-sides`} label={t("printSides")}>
        <select
          id={`${idPrefix}-sides`}
          className={SELECT}
          value={value.sides}
          onChange={(e) => onChange({ sides: e.target.value as DocOptions["sides"] })}
        >
          <option value="one">{t("printOneSided")}</option>
          <option value="two">{t("printDuplex")}</option>
        </select>
      </Field>
      <div className="flex min-w-0 flex-col gap-1 text-sm">
        <span className="text-(--muted)">{t("printCopies")}</span>
        <QtyStepper
          size="sm"
          value={value.copies}
          max={SHOP_PRINT_MAX_COPIES}
          label={t("printCopies")}
          onChange={(copies) => onChange({ copies })}
        />
      </div>
    </div>
  );
}

function PhotoOptionFields({
  value,
  onChange,
  t,
  idPrefix,
}: {
  value: PhotoOptions;
  onChange: (p: Partial<PhotoOptions>) => void;
  t: ShopT;
  idPrefix: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
      <Field id={`${idPrefix}-size`} label={t("printPhotoSize")}>
        <select id={`${idPrefix}-size`} className={SELECT} value={value.size} onChange={(e) => onChange({ size: e.target.value })}>
          {SHOP_PHOTO_SIZES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id === "polaroid" ? `Polaroid (${photoSizeText(s)})` : photoSizeText(s)}
            </option>
          ))}
        </select>
      </Field>
      <Field id={`${idPrefix}-finish`} label={t("printFinish")}>
        <select
          id={`${idPrefix}-finish`}
          className={SELECT}
          value={value.finish}
          onChange={(e) => onChange({ finish: e.target.value as PhotoOptions["finish"] })}
        >
          {SHOP_PHOTO_FINISHES.map((f) => (
            <option key={f} value={f}>
              {f === "matte" ? t("printMatte") : t("printGlossy")}
              {f === SHOP_PHOTO_DEFAULT_FINISH ? ` (${t("printDefault")})` : ""}
            </option>
          ))}
        </select>
      </Field>
      <div className="col-span-2 flex min-w-0 flex-col gap-1 text-sm sm:col-span-1">
        <span className="text-(--muted)">{t("printCopies")}</span>
        <QtyStepper
          size="sm"
          value={value.copies}
          max={SHOP_PRINT_MAX_COPIES}
          label={t("printCopies")}
          onChange={(copies) => onChange({ copies })}
        />
      </div>
    </div>
  );
}

function FileRow({
  mode,
  entry: e,
  price,
  onPatch,
  onRemove,
  onRetry,
}: {
  mode: ShopPrintMode;
  entry: Entry;
  price: number | null;
  onPatch: (p: Partial<Entry>) => void;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const { t, lang } = useShopLang();
  const pagesId = useId();
  const [pagesDraft, setPagesDraft] = useState<string>(e.pages != null ? String(e.pages) : "");
  const size = shopPhotoSize(e.photo.size);
  const dpi: number | null = mode === "photo" ? photoDpi(e.px, e.photo.size) : null;
  const low: boolean = mode === "photo" && photoLowRes(e.px, e.photo.size);
  const sizeLabel: string = size ? photoSizeText(size) : e.photo.size;
  const badge: string = e.kind === "word" ? "DOC" : e.kind === "image" ? "IMG" : "PDF";

  return (
    <li className="flex flex-col gap-3 rounded-[14px] border-[1.5px] border-(--line2) p-3 sm:p-4">
      <div className="flex items-start gap-3">
        {e.thumb ? (
          // eslint-disable-next-line @next/next/no-img-element -- local thumbnail data URL
          <img src={e.thumb} alt="" className="h-14 w-14 shrink-0 rounded-lg bg-(--soft) object-cover" />
        ) : (
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-(--soft) text-xs font-extrabold text-(--muted)">
            {badge}
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <b className="truncate text-[15px]" title={e.name}>
            {e.name}
          </b>
          <span className="text-xs text-(--muted2)">
            {e.sizeBytes ? formatFileSize(e.sizeBytes) : null}
            {mode === "doc" && e.pages != null && e.pagesState === "auto" ? ` · ${t("printPagesN", { n: e.pages })}` : ""}
            {e.px ? ` · ${e.px.width}×${e.px.height} px` : ""}
          </span>
          {e.status === "queued" || e.status === "uploading" ? (
            <span className="text-sm text-(--muted)" aria-live="polite">
              {t("uploading", { pct: e.pct })}
            </span>
          ) : null}
          {e.status === "error" ? (
            <span role="alert" className="text-sm text-(--err)">
              {e.error ?? t("uploadFailed")}{" "}
              {e.file ? (
                <button type="button" onClick={onRetry} className="font-semibold underline">
                  {t("printRetry")}
                </button>
              ) : null}
            </span>
          ) : null}
          {isBigPrintFile(e.sizeBytes) && e.status !== "done" ? (
            <span className="text-sm text-(--warn)">{t("printBigFile", { size: formatFileSize(e.sizeBytes) })}</span>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <b className="text-[15px]">{price != null ? formatPrice(price, lang) : "—"}</b>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`${t("uploadRemove")} — ${e.name}`}
            className="min-h-9 px-1 text-sm text-(--muted) underline"
          >
            {t("uploadRemove")}
          </button>
        </div>
      </div>
      {e.status === "queued" || e.status === "uploading" ? (
        <div className="h-1.5 overflow-hidden rounded-full bg-(--soft)" aria-hidden>
          <div className="h-full bg-(--gold) transition-[width]" style={{ width: `${e.pct}%` }} />
        </div>
      ) : null}

      {mode === "doc" ? (
        <>
          {e.pagesState === "counting" ? <span className="text-sm text-(--muted)">{t("printPagesCounting")}</span> : null}
          {e.pagesState === "manual" ? (
            <label htmlFor={pagesId} className="flex flex-wrap items-center gap-2 text-sm">
              <span className={e.pages == null ? "font-semibold text-(--warn)" : "text-(--muted)"}>
                {e.pages == null && e.kind === "pdf" ? (isBigPrintFile(e.sizeBytes) ? t("printPagesBig") : t("printPagesAsk")) : t("printPages")}
              </span>
              <input
                id={pagesId}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                value={pagesDraft}
                onChange={(ev) => {
                  const raw = ev.target.value.replace(/\D/g, "").slice(0, 4);
                  setPagesDraft(raw);
                  const n = Number(raw);
                  onPatch({ pages: raw && n >= 1 ? Math.min(n, SHOP_PRINT_MAX_PAGES) : null });
                }}
                className="min-h-10 w-24 rounded-[10px] border-[1.5px] border-(--line2) bg-white px-3 font-semibold"
              />
            </label>
          ) : null}
          <DocOptionFields value={e.doc} onChange={(p) => onPatch({ doc: { ...e.doc, ...p } })} t={t} idPrefix={e.id} />
        </>
      ) : (
        <>
          <PhotoOptionFields value={e.photo} onChange={(p) => onPatch({ photo: { ...e.photo, ...p } })} t={t} idPrefix={e.id} />
          {dpi != null ? (
            <span role={low ? "alert" : undefined} className={`text-sm ${low ? "font-semibold text-(--warn)" : "text-(--muted2)"}`}>
              {low ? t("printLowRes", { size: sizeLabel, dpi }) : t("printResOk", { size: sizeLabel, dpi })}
            </span>
          ) : null}
        </>
      )}
    </li>
  );
}

function PriceList({ mode, t, lang }: { mode: ShopPrintMode; t: ShopT; lang: Parameters<typeof formatPrice>[1] }) {
  return (
    <section aria-labelledby="print-prices" className="flex flex-col gap-2 rounded-[14px] border-[1.5px] border-(--line2) p-4 text-sm">
      <b id="print-prices" className="text-[15px]">
        {t("printPrices")}
      </b>
      {mode === "doc" ? (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {SHOP_DOC_FORMATS.flatMap((format) =>
            (["bw", "color"] as const).map((color) => (
              <li key={`${format}-${color}`}>
                {t("printPricePage", {
                  format,
                  color: color === "color" ? t("printColorOpt") : t("printBw"),
                  one: formatPrice(docUnitPrice(format, color, "one"), lang),
                  two: formatPrice(docUnitPrice(format, color, "two"), lang),
                })}
              </li>
            )),
          )}
        </ul>
      ) : (
        <>
          <ul className="m-0 grid list-none grid-cols-2 gap-x-4 gap-y-1 p-0">
            {SHOP_PHOTO_SIZES.map((s) => (
              <li key={s.id} className="flex justify-between gap-2">
                <span>{s.id === "polaroid" ? "Polaroid" : photoSizeText(s)}</span>
                <b>{formatPrice(s.tiers[0]!.priceMdl, lang)}</b>
              </li>
            ))}
          </ul>
          <span className="text-(--muted2)">{t("printPhotoCrop")}</span>
        </>
      )}
      <span className="text-(--muted2)">{t("printNoDiscount")}</span>
    </section>
  );
}
