"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  SHOP_BC_BLEED_MM,
  SHOP_BC_DEFAULT_PACK,
  SHOP_BC_FILE_MM,
  SHOP_BC_IMAGE,
  SHOP_BC_PACKS,
  SHOP_BC_SAFE_MM,
  SHOP_BC_SLUG,
  SHOP_BC_BACK_PER_CARD_MDL,
  checkShopBcArtwork,
  isShopBcPack,
  shopBcExpectedPx,
  shopBcPerCardMdl,
  shopBcRequiredZones,
  shopBcTemplateSvg,
  shopBcTotalMdl,
  type ShopBcArtworkCheck,
  type ShopBcSides,
  type ShopBcZone,
} from "@/lib/storefront/businessCards";
import { newLineId, type CartLine } from "@/lib/storefront/cart";
import { dispatchCart, useCart, useHydrated } from "@/lib/storefront/cartStore";
import { formatPrice } from "@/lib/storefront/format";
import type { ShopT } from "@/lib/storefront/i18n";
import { useLiveQuote } from "@/lib/storefront/quoteClient";
import type { ShopFileRef, ShopQuoteLine } from "@/lib/storefront/types";
import { readImageSize, ShopUploadError, uploadArtwork } from "@/lib/storefront/upload";
import { UploadIcon } from "./ShopIcons";
import { useShopLang } from "./ShopLangProvider";

const ACCEPT = "application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg";

type FaceState =
  | { status: "uploading"; name: string; pct: number }
  | { status: "done"; ref: ShopFileRef; check: ShopBcArtworkCheck | null; previewUrl: string | null; pdf: boolean }
  | { status: "error"; name: string; message: string };

const PT_TO_MM = 25.4 / 72;

/** First page size of a PDF (mm), or null when it cannot be read. */
async function readPdfPageMm(file: File): Promise<{ width: number; height: number } | null> {
  try {
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
    const page = doc.getPages()[0];
    if (!page) return null;
    const box = page.getMediaBox();
    return { width: box.width * PT_TO_MM, height: box.height * PT_TO_MM };
  } catch {
    return null;
  }
}

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

/**
 * «Cărți de vizită» product page: pack, sides, one file per printed face
 * (required), a size / quality check, a preview with the cut line and safe
 * zone, a template and the price. With `editId` it edits that cart line.
 */
export function BusinessCardView({ editId = null }: { editId?: string | null }) {
  const lines = useCart();
  const hydrated = useHydrated();
  const editLine: CartLine | null =
    editId && hydrated ? (lines.find((l) => l.id === editId && l.slug === SHOP_BC_SLUG) ?? null) : null;
  return <BusinessCardEditor key={editLine?.id ?? "new"} editLine={editLine} />;
}

function initialFaces(editLine: CartLine | null): Record<ShopBcZone, FaceState | null> {
  const out: Record<ShopBcZone, FaceState | null> = { front: null, back: null };
  for (const f of editLine?.files ?? []) {
    const zone: ShopBcZone = f.zone === "back" ? "back" : "front";
    out[zone] = { status: "done", ref: { ...f, zone }, check: null, previewUrl: null, pdf: /\.pdf$/i.test(f.fileName) };
  }
  return out;
}

function BusinessCardEditor({ editLine }: { editLine: CartLine | null }) {
  const { t, lang, href, paymentLive } = useShopLang();
  const router = useRouter();
  const editQuote = editLine?.quote.kind === "businessCard" ? editLine.quote : null;
  const [pack, setPack] = useState<number>(editQuote && isShopBcPack(editQuote.quantity) ? editQuote.quantity : SHOP_BC_DEFAULT_PACK);
  const [sides, setSides] = useState<ShopBcSides>(editQuote?.sides ?? "one");
  const [faces, setFaces] = useState<Record<ShopBcZone, FaceState | null>>(() => initialFaces(editLine));
  const [previewZone, setPreviewZone] = useState<ShopBcZone>("front");
  const [added, setAdded] = useState(false);
  const [hint, setHint] = useState(false);

  // Free the local previews when they are replaced or the page closes.
  const urls = useRef<Set<string>>(new Set());
  useEffect(() => {
    const set = urls.current;
    return () => set.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const quoteLine: ShopQuoteLine = useMemo(() => ({ kind: "businessCard", pricing: "shopPack", sides, quantity: pack }), [sides, pack]);
  const quote = useLiveQuote(quoteLine, lang);
  const localTotal: number | null = shopBcTotalMdl(pack, sides);
  const total: number | null = quote.status === "done" ? (quote.line.ok ? quote.line.total : null) : localTotal;
  const failed: boolean = (quote.status === "done" && !quote.line.ok) || quote.status === "error";

  const zones: ShopBcZone[] = shopBcRequiredZones(sides);
  const uploading: boolean = zones.some((z) => faces[z]?.status === "uploading");
  const missing: ShopBcZone[] = zones.filter((z) => faces[z]?.status !== "done");
  const doneFiles: ShopFileRef[] = zones.flatMap((z) => {
    const f = faces[z];
    return f?.status === "done" ? [{ ...f.ref, zone: z }] : [];
  });
  const shownZone: ShopBcZone = zones.includes(previewZone) ? previewZone : "front";

  const setFace = (zone: ShopBcZone, next: FaceState | null) =>
    setFaces((m) => {
      const prev = m[zone];
      if (prev?.status === "done" && prev.previewUrl) {
        URL.revokeObjectURL(prev.previewUrl);
        urls.current.delete(prev.previewUrl);
      }
      return { ...m, [zone]: next };
    });

  const addToCart = () => {
    if (uploading) return;
    if (missing.length) {
      setHint(true);
      document.getElementById(`shop-bc-file-${missing[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const faceLabel = (z: ShopBcZone) => (z === "back" ? t("bcFileBack") : t("bcFileFront"));
    const line: CartLine = {
      id: editLine?.id ?? newLineId(),
      slug: SHOP_BC_SLUG,
      title: t("bcTitle"),
      optionsText: sides === "two" ? t("bcSidesTwo") : t("bcSidesOne"),
      image: SHOP_BC_IMAGE,
      quote: quoteLine,
      files: doneFiles,
      note: doneFiles.map((f) => `${faceLabel(f.zone === "back" ? "back" : "front")}: ${f.fileName}`).join("; "),
      lastTotal: total,
      // Runs in the click handler, not during render.
      // eslint-disable-next-line react-hooks/purity
      addedAt: editLine?.addedAt ?? Date.now(),
    };
    setHint(false);
    if (editLine) {
      dispatchCart({ type: "update", line });
      router.push(href("/shop/cos"));
      return;
    }
    dispatchCart({ type: "add", line });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 2500);
  };

  const templateHref: string = useMemo(
    () =>
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
        shopBcTemplateSvg({ bleed: t("bcTplBleed"), trim: t("bcTplTrim"), safe: t("bcTplSafe") }),
      )}`,
    [t],
  );
  const px = shopBcExpectedPx();
  const addLabel: string = editLine ? t("updateInCart") : t("addToCart");
  const canAdd: boolean = !uploading && !failed;
  const shown = faces[shownZone];

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
      <div className="flex flex-col gap-3 lg:sticky lg:top-4">
        <div className="flex items-center justify-between gap-3">
          <b className="text-[15px]">{t("bcPreview")}</b>
          {sides === "two" ? (
            <div className="flex gap-1.5" role="group" aria-label={t("bcPreview")}>
              {(["front", "back"] as const).map((z) => (
                <button
                  key={z}
                  type="button"
                  aria-pressed={shownZone === z}
                  onClick={() => setPreviewZone(z)}
                  className={`min-h-9 rounded-lg border-[1.5px] px-3 text-sm font-bold ${
                    shownZone === z ? "border-(--ink) bg-(--ink) text-white" : "border-(--line2) bg-white"
                  }`}
                >
                  {z === "back" ? t("zoneBack") : t("zoneFront")}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <CardPreview face={shown ?? null} t={t} />
        <span className="text-sm text-(--muted2)">{t("bcPreviewLegend")}</span>
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="m-0 text-[26px] leading-tight font-extrabold sm:text-4xl">{t("bcTitle")}</h1>
          <span className="text-base font-bold text-(--gold-ink)">
            {t("perPiece", { price: formatPrice(shopBcPerCardMdl("one"), lang) })}
          </span>
          <p className="m-0 text-base leading-relaxed text-(--muted)">{t("bcDescription")}</p>
          {editLine ? (
            <p role="status" className="m-0 rounded-xl bg-(--warn-soft) px-4 py-2.5 text-sm font-semibold text-(--warn)">
              {t("editingLine")}
            </p>
          ) : null}
        </div>

        <section aria-labelledby="bc-size" className="flex flex-col gap-1.5 rounded-[14px] border-[1.5px] border-(--line2) p-4 text-sm">
          <b id="bc-size" className="text-[15px]">
            {t("bcSizeTitle")}
          </b>
          <span>{t("bcSizeFinished")}</span>
          <span>{t("bcSizeFile")}</span>
          <span>{t("bcSizeSafe")}</span>
          <span className="text-(--muted)">{t("bcSizeRes", { px: `${px.width}×${px.height}` })}</span>
          <a
            href={templateHref}
            download={`sablon-carte-vizita-${SHOP_BC_FILE_MM.width}x${SHOP_BC_FILE_MM.height}mm.svg`}
            className="mt-1 self-start font-semibold underline"
          >
            {t("bcTemplate")}
          </a>
        </section>

        <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
          <legend className="mb-2.5 p-0 text-[15px] font-bold">{t("bcPack")}</legend>
          <div className="flex flex-wrap gap-2.5">
            {SHOP_BC_PACKS.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={pack === n}
                onClick={() => setPack(n)}
                className={`min-h-11 rounded-[10px] border-[1.5px] px-4 font-bold ${
                  pack === n ? "border-(--ink) bg-(--ink) text-white" : "border-(--line2) bg-white"
                }`}
              >
                {t("bcPackOption", { n })}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
          <legend className="mb-2.5 p-0 text-[15px] font-bold">{t("bcSides")}</legend>
          <div className="flex flex-wrap gap-2.5">
            {(["one", "two"] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={sides === s}
                onClick={() => setSides(s)}
                className={`flex min-h-11 flex-col items-start justify-center rounded-[10px] border-[1.5px] px-4 py-1.5 text-left ${
                  sides === s ? "border-(--ink) bg-(--ink) text-white" : "border-(--line2) bg-white"
                }`}
              >
                <span className="font-bold">{s === "two" ? t("bcSidesTwo") : t("bcSidesOne")}</span>
                {s === "two" && SHOP_BC_BACK_PER_CARD_MDL > 0 ? (
                  <span className="text-xs opacity-80">{t("bcSidesExtra", { price: formatPrice(SHOP_BC_BACK_PER_CARD_MDL, lang) })}</span>
                ) : null}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2.5">
          {zones.map((z) => (
            <FaceUpload
              key={z}
              zone={z}
              label={z === "back" ? t("bcFileBack") : t("bcFileFront")}
              value={faces[z]}
              onChange={(next) => {
                setFace(z, next);
                if (next?.status === "done" && next.previewUrl) urls.current.add(next.previewUrl);
                if (next) setPreviewZone(z);
              }}
            />
          ))}
          <span className={`text-sm ${hint && missing.length ? "font-semibold text-(--err)" : "text-(--muted2)"}`}>
            {hint && missing.length ? t("bcFilesRequired") : t("bcFilesRequiredNote")}
          </span>
        </div>

        <div className="flex flex-col gap-3.5 rounded-2xl bg-(--soft) p-5">
          <div className="flex min-h-[64px] flex-col justify-center gap-1" aria-live="polite" aria-busy={quote.status === "loading"}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-(--muted)">{t("total")}</span>
              <span className={`text-[30px] font-extrabold sm:text-[34px] ${quote.status === "loading" ? "opacity-50" : ""}`}>
                {total != null ? formatPrice(total, lang) : "—"}
              </span>
            </div>
            <span className="self-end text-sm text-(--muted2)">
              {t("bcPricePerCard", { price: formatPrice(shopBcPerCardMdl(sides), lang), n: pack })}
            </span>
            {quote.status === "done" && !quote.line.ok ? <span className="text-sm text-(--err)">{t("priceUnavailable")}</span> : null}
            {quote.status === "error" ? <span className="text-sm text-(--err)">{t("priceError")}</span> : null}
          </div>
          <button
            type="button"
            onClick={addToCart}
            disabled={!canAdd}
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
      </div>

      {/* Phone: sticky add-to-cart bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-(--line) bg-white px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] md:hidden">
        <button
          type="button"
          onClick={addToCart}
          disabled={!canAdd}
          className="shop-btn-dark min-h-12 flex-1 rounded-xl bg-(--ink) px-3 text-base font-extrabold disabled:opacity-50"
        >
          {added ? `✓ ${t("addedToCart")}` : editLine ? t("updateInCart") : t("addToCartShort")}
          {!added && total != null ? ` · ${formatPrice(total, lang)}` : ""}
        </button>
      </div>
    </div>
  );
}

/** The card at 94:54 with the uploaded face stretched over it (as the imposition does), the cut line and the safe zone. */
function CardPreview({ face, t }: { face: FaceState | null; t: ShopT }) {
  const W = SHOP_BC_FILE_MM.width;
  const H = SHOP_BC_FILE_MM.height;
  const pct = (mm: number, of: number) => `${(mm / of) * 100}%`;
  const trim = SHOP_BC_BLEED_MM;
  const safe = SHOP_BC_BLEED_MM + SHOP_BC_SAFE_MM;
  const done = face?.status === "done" ? face : null;
  return (
    <div
      className="relative w-full overflow-hidden rounded-md border border-(--line2) bg-white shadow-sm"
      style={{ aspectRatio: `${W} / ${H}` }}
    >
      {done?.previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- local object URL of the file just chosen
        <img src={done.previewUrl} alt="" className="absolute inset-0 h-full w-full object-fill" />
      ) : (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-(--muted2)">
          {done ? (
            <span className="flex flex-col items-center gap-1">
              <b className="text-2xl text-(--muted)">{done.pdf ? "PDF" : "✓"}</b>
              <span className="max-w-[80%] truncate">{done.ref.fileName}</span>
            </span>
          ) : (
            t("bcPreviewEmpty")
          )}
        </div>
      )}
      <div
        aria-hidden
        className="pointer-events-none absolute border-[1.5px] border-[#e11d48]"
        style={{ left: pct(trim, W), right: pct(trim, W), top: pct(trim, H), bottom: pct(trim, H) }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute border-[1.5px] border-dashed border-[#2563eb]"
        style={{ left: pct(safe, W), right: pct(safe, W), top: pct(safe, H), bottom: pct(safe, H) }}
      />
    </div>
  );
}

function checkText(check: ShopBcArtworkCheck | null, pdf: boolean, t: ShopT): { text: string; warn: boolean } | null {
  const px = shopBcExpectedPx();
  const pxText = `${px.width}×${px.height}`;
  if (!check) return pdf ? { text: t("bcCheckPdfUnknown"), warn: false } : null;
  const size = check.sizeMm ? { w: check.sizeMm.width, h: check.sizeMm.height } : { w: "?", h: "?" };
  if (check.ok) {
    return pdf
      ? { text: t("bcCheckOkPdf", size), warn: false }
      : { text: t("bcCheckOkImage", { w: check.px?.width ?? "?", h: check.px?.height ?? "?", dpi: check.dpi ?? "?" }), warn: false };
  }
  const parts: string[] = check.issues.map((issue) => {
    switch (issue) {
      case "no_bleed":
        return t("bcCheckNoBleed");
      case "wrong_proportions":
        return t("bcCheckProportions");
      case "too_small":
        return t("bcCheckTooSmall", size);
      case "low_dpi":
        return t("bcCheckLowDpi", { dpi: check.dpi ?? "?", px: pxText });
    }
  });
  return { text: parts.join(" "), warn: true };
}

/** Upload of one face: uploads right away, then checks the size / resolution. */
function FaceUpload({
  zone,
  label,
  value,
  onChange,
}: {
  zone: ShopBcZone;
  label: string;
  value: FaceState | null;
  onChange: (next: FaceState | null) => void;
}) {
  const { t } = useShopLang();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const token = useRef(0);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const my = ++token.current;
    onChange({ status: "uploading", name: file.name, pct: 0 });
    const pdf: boolean = isPdfFile(file);
    const measure: Promise<ShopBcArtworkCheck | null> = pdf
      ? readPdfPageMm(file).then((pageMm) => checkShopBcArtwork({ pageMm }))
      : readImageSize(file).then((size) => checkShopBcArtwork({ px: size }));
    try {
      const ref = await uploadArtwork(file, (pct) => {
        if (token.current === my) onChange({ status: "uploading", name: file.name, pct });
      });
      const check = await measure;
      if (token.current !== my) return;
      const lowRes: boolean = check?.issues.includes("low_dpi") ?? false;
      onChange({
        status: "done",
        ref: { ...ref, zone, ...(lowRes ? { lowRes: true } : {}) },
        check,
        previewUrl: pdf ? null : URL.createObjectURL(file),
        pdf,
      });
    } catch (e) {
      if (token.current !== my) return;
      onChange({
        status: "error",
        name: file.name,
        message: e instanceof ShopUploadError && e.code === "too_big" ? t("uploadTooBig") : t("uploadFailed"),
      });
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const note = value?.status === "done" ? checkText(value.check, value.pdf, t) : null;

  return (
    <div id={`shop-bc-file-${zone}`} className="flex flex-col gap-2 rounded-[14px] border-[1.5px] border-(--line2) p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-(--muted)">
          <UploadIcon size={22} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <b>{label}</b>
          {value == null ? <span className="text-sm leading-snug text-(--muted)">{t("uploadOwnText")}</span> : null}
          {value?.status === "uploading" ? (
            <span className="text-sm text-(--muted)" aria-live="polite">
              <span className="block truncate">{value.name}</span>
              {t("uploading", { pct: value.pct })}
            </span>
          ) : null}
          {value?.status === "done" ? <span className="truncate text-sm font-semibold text-(--ok)">✓ {value.ref.fileName}</span> : null}
          {value?.status === "error" ? (
            <span role="alert" className="text-sm text-(--err)">
              {value.message}
            </span>
          ) : null}
          {note ? (
            <span role={note.warn ? "alert" : undefined} className={`text-sm ${note.warn ? "text-(--warn)" : "text-(--muted)"}`}>
              {note.text}
            </span>
          ) : null}
        </div>
      </div>
      {value?.status === "uploading" ? (
        <div className="h-1.5 overflow-hidden rounded-full bg-(--soft)" aria-hidden>
          <div className="h-full bg-(--gold) transition-[width]" style={{ width: `${value.pct}%` }} />
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <label
          htmlFor={inputId}
          className="inline-flex min-h-11 cursor-pointer items-center rounded-[10px] bg-(--soft) px-4 text-sm font-bold focus-within:outline-2 focus-within:outline-(--ink)"
        >
          {value?.status === "done" ? t("uploadReplace") : t("uploadChoose")}
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </label>
        {value && value.status !== "uploading" ? (
          <button
            type="button"
            onClick={() => {
              token.current++;
              onChange(null);
            }}
            className="min-h-11 rounded-[10px] px-3 text-sm font-semibold text-(--muted) underline"
          >
            {t("uploadRemove")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
