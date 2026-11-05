"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { newLineId, type CartLine } from "@/lib/storefront/cart";
import { dispatchCart, useCart, useHydrated } from "@/lib/storefront/cartStore";
import { formatPrice } from "@/lib/storefront/format";
import { useLiveQuote } from "@/lib/storefront/quoteClient";
import type { ShopFileRef, ShopQuoteLine } from "@/lib/storefront/types";
import { readImageSize, ShopUploadError, uploadArtwork } from "@/lib/storefront/upload";
import { psFormat, psProduct, type PsFormat, type PsLamination, type PsProduct, type PsProductId, type PsSides } from "@/lib/storefront/printShop/config";
import {
  isPsQuoteLine,
  psBleedMm,
  psCheckArtwork,
  psExpectedPx,
  psFileMm,
  psFitRect,
  psLaminationPerPiece,
  psLinePrice,
  psRequiredZones,
  psSafeMm,
  psTemplateSvg,
  type PsArtworkCheck,
  type PsFit,
  type PsQuoteLine,
  type PsZone,
} from "@/lib/storefront/printShop/pricing";
import { psLineOptions, psPagesText, psPerPieceText, psProportionsKey, psSheetsText, psT, type PsT } from "@/lib/storefront/printShop/text";
import type { ShopLang } from "@/lib/storefront/i18n";
import { AddedToast } from "./AddedToast";
import { UploadIcon } from "./ShopIcons";
import { useShopLang } from "./ShopLangProvider";
import { StickyCtaLabel } from "./ProductBits";

const ACCEPT_ANY = "application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg";
const ACCEPT_PDF = "application/pdf,.pdf";
const PT_TO_MM = 25.4 / 72;

type FaceState =
  | { status: "uploading"; name: string; pct: number }
  | { status: "done"; ref: ShopFileRef; check: PsArtworkCheck | null; previewUrl: string | null; pdf: boolean }
  | { status: "error"; name: string; message: string };

/** First page size (mm) and page count of a PDF, or nulls when unreadable. */
async function readPdfFacts(file: File): Promise<{ pageMm: { width: number; height: number } | null; pages: number | null }> {
  try {
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
    const page = doc.getPages()[0];
    if (!page) return { pageMm: null, pages: doc.getPageCount() };
    const box = page.getMediaBox();
    return { pageMm: { width: box.width * PT_TO_MM, height: box.height * PT_TO_MM }, pages: doc.getPageCount() };
  } catch {
    return { pageMm: null, pages: null };
  }
}

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image"));
    img.src = src;
  });
}

function canvasJpeg(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): string | null {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  draw(ctx);
  return canvas.toDataURL("image/jpeg", 0.85);
}

async function makeFaceThumb(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const s: number = Math.min(1, 480 / Math.max(img.naturalWidth, img.naturalHeight));
    const w: number = Math.max(1, Math.round(img.naturalWidth * s));
    const h: number = Math.max(1, Math.round(img.naturalHeight * s));
    return canvasJpeg(w, h, (ctx) => ctx.drawImage(img, 0, 0, w, h));
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Cart thumbnail: the face on the piece, cropped / fitted as printed. */
async function makePieceThumb(src: string, fileMm: { width: number; height: number }, fit: PsFit): Promise<string | null> {
  try {
    const img = await loadImage(src);
    const W = 376;
    const H = Math.round((W * fileMm.height) / fileMm.width);
    const r = psFitRect({ width: img.naturalWidth, height: img.naturalHeight }, { width: W, height: H }, fit);
    return canvasJpeg(W, H, (ctx) => ctx.drawImage(img, r.x, r.y, r.width, r.height));
  } catch {
    return null;
  }
}

function pdfThumbUrl(fileMm: { width: number; height: number }): string {
  const W = 100;
  const H = Math.round((W * fileMm.height) / fileMm.width);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="2" fill="#fff" stroke="#d4d4d8"/><rect x="${W / 2 - 18}" y="${H / 2 - 12}" width="36" height="24" rx="3" fill="#dc2626"/><text x="${W / 2}" y="${H / 2 + 5}" font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="#fff" text-anchor="middle">PDF</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function revokeBlob(url: string | null | undefined): void {
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
}

/**
 * Print-shop product page («Tipografie»): format, paper, sides, pack,
 * finishing, one file per printed side (one PDF for a paper product), a
 * size / quality check, a preview with the cut line and safe zone, a
 * template and the live price (server quote). With `editId` it edits that cart line.
 */
export function PrintShopView({ productId, editId = null }: { productId: PsProductId; editId?: string | null }) {
  const product = psProduct(productId)!;
  const lines = useCart();
  const hydrated = useHydrated();
  const editLine: CartLine | null =
    editId && hydrated ? (lines.find((l) => l.id === editId && l.slug === product.slug) ?? null) : null;
  return <PrintShopEditor key={editLine?.id ?? "new"} product={product} editLine={editLine} />;
}

function initialFaces(editLine: CartLine | null): Record<PsZone, FaceState | null> {
  const out: Record<PsZone, FaceState | null> = { front: null, back: null };
  for (const f of editLine?.files ?? []) {
    const zone: PsZone = f.zone === "back" ? "back" : "front";
    out[zone] = { status: "done", ref: { ...f, zone }, check: null, previewUrl: f.thumb ?? null, pdf: /\.pdf$/i.test(f.fileName) };
  }
  return out;
}

function choiceClass(active: boolean): string {
  return `flex min-h-11 flex-col items-start justify-center rounded-[10px] border-[1.5px] px-4 py-1.5 text-left ${
    active ? "border-(--ink) bg-(--ink) text-white" : "border-(--line2) bg-white"
  }`;
}

function PrintShopEditor({ product, editLine }: { product: PsProduct; editLine: CartLine | null }) {
  const { lang, href, paymentLive, t: shopTr } = useShopLang();
  const t: PsT = useMemo(() => psT(lang), [lang]);
  const router = useRouter();
  const editQuote: PsQuoteLine | null =
    editLine && isPsQuoteLine(editLine.quote) && editLine.quote.product === product.id ? editLine.quote : null;
  const [formatId, setFormatId] = useState<string>(editQuote?.format ?? product.formats[0]!.id);
  const [paper, setPaper] = useState<number | null>(editQuote?.paper ?? product.defaultPaper);
  const [sides, setSides] = useState<PsSides>(editQuote?.sides ?? product.sides[0]!);
  const [pack, setPack] = useState<number>(editQuote?.quantity ?? product.defaultPack);
  const [lamination, setLamination] = useState<PsLamination | null>(editQuote?.lamination ?? null);
  const [cut, setCut] = useState<boolean>(editQuote?.cut ?? false);
  const [faces, setFaces] = useState<Record<PsZone, FaceState | null>>(() => initialFaces(editLine));
  const [previewZone, setPreviewZone] = useState<PsZone>("front");
  const [fitChoice, setFitChoice] = useState<PsFit | null>(editQuote?.fit ?? null);
  const [added, setAdded] = useState(false);
  const [hint, setHint] = useState(false);

  const urls = useRef<Set<string>>(new Set());
  useEffect(() => {
    const set = urls.current;
    return () => set.forEach((u) => revokeBlob(u));
  }, []);

  const format: PsFormat = psFormat(product, formatId) ?? product.formats[0]!;
  const fileMm = psFileMm(product, format);
  const pdfOnly: boolean = product.pagesPerPiece != null;
  const zones: PsZone[] = product.path === "paper" ? ["front"] : psRequiredZones({ sides });
  const lamOffered: PsLamination[] = format.laminationSize && !cut ? [...(product.lamination?.finishes ?? [])] : [];
  const lam: PsLamination | null = lamination && lamOffered.includes(lamination) ? lamination : null;

  const wrongProportions: boolean = zones.some((z) => {
    const f = faces[z];
    return f?.status === "done" && !!f.check?.issues.includes("wrong_proportions");
  });
  const showFit: boolean = !pdfOnly && (wrongProportions || fitChoice != null);
  const fit: PsFit = fitChoice ?? "cover";
  const lineFit: PsFit | null = showFit ? fit : null;

  const quoteLine: PsQuoteLine = useMemo(
    () => ({
      kind: "sheetShop",
      product: product.id,
      format: format.id,
      ...(product.papers.length && paper != null ? { paper } : {}),
      sides,
      quantity: pack,
      ...(lam ? { lamination: lam } : {}),
      ...(cut ? { cut: true } : {}),
      ...(lineFit ? { fit: lineFit } : {}),
    }),
    [product, format.id, paper, sides, pack, lam, cut, lineFit],
  );
  const quote = useLiveQuote(quoteLine as ShopQuoteLine, lang);
  const local = psLinePrice(quoteLine);
  const total: number | null = quote.status === "done" ? (quote.line.ok ? quote.line.total : null) : (local?.total ?? null);
  const failed: boolean = (quote.status === "done" && !quote.line.ok) || quote.status === "error";

  const uploading: boolean = zones.some((z) => faces[z]?.status === "uploading");
  const missing: PsZone[] = zones.filter((z) => faces[z]?.status !== "done");
  const doneFiles: ShopFileRef[] = zones.flatMap((z) => {
    const f = faces[z];
    return f?.status === "done" ? [{ ...f.ref, zone: z }] : [];
  });
  const shownZone: PsZone = zones.includes(previewZone) ? previewZone : "front";

  // A new format makes the earlier checks stale: re-check them against the new size.
  const recheck = (next: PsFormat) =>
    setFaces((m) => {
      const out = { ...m };
      for (const z of ["front", "back"] as const) {
        const f = m[z];
        if (f?.status === "done" && f.check) {
          out[z] = {
            ...f,
            check: psCheckArtwork(product, next, {
              px: f.check.px ?? null,
              pageMm: f.check.px ? null : (f.check.sizeMm ?? null),
              pages: f.check.pages ?? null,
            }),
          };
        }
      }
      return out;
    });

  const setFace = (zone: PsZone, next: FaceState | null) =>
    setFaces((m) => {
      const prev = m[zone];
      if (prev?.status === "done" && prev.previewUrl) {
        revokeBlob(prev.previewUrl);
        urls.current.delete(prev.previewUrl);
      }
      return { ...m, [zone]: next };
    });

  const faceLabel = (z: PsZone): string =>
    product.path === "paper" ? t("fileOne") : z === "back" ? t("fileBack") : t("fileFront");

  const addToCart = async () => {
    if (uploading) return;
    if (missing.length) {
      setHint(true);
      document.getElementById(`shop-ps-file-${missing[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const front = faces.front?.status === "done" ? faces.front : null;
    const image: string =
      (front?.pdf ? pdfThumbUrl(fileMm) : front?.previewUrl ? await makePieceThumb(front.previewUrl, fileMm, fit) : null) ?? product.image;
    const line: CartLine = {
      id: editLine?.id ?? newLineId(),
      slug: product.slug,
      title: product.name[lang],
      optionsText: psLineOptions(quoteLine, lang),
      image,
      quote: quoteLine as ShopQuoteLine,
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
    window.setTimeout(() => setAdded(false), 4000);
  };

  const templateHref: string = useMemo(
    () =>
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
        psTemplateSvg(product, format, { bleed: t("tplBleed"), trim: t("tplTrim"), safe: t("tplSafe"), fold: t("tplFold") }),
      )}`,
    [product, format, t],
  );
  const px = psExpectedPx(product, format);
  const bleed: number = psBleedMm(product);
  const sheets: boolean = product.id === "stickerSheets";
  const canAdd: boolean = !uploading && !failed;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
      <div className="flex flex-col gap-3 lg:sticky lg:top-4">
        <div className="flex items-center justify-between gap-3">
          <b className="text-[15px]">{t("preview")}</b>
          {zones.length > 1 ? (
            <div className="flex gap-1.5" role="group" aria-label={t("preview")}>
              {zones.map((z) => (
                <button
                  key={z}
                  type="button"
                  aria-pressed={shownZone === z}
                  onClick={() => setPreviewZone(z)}
                  className={`min-h-9 rounded-lg border-[1.5px] px-3 text-sm font-bold ${
                    shownZone === z ? "border-(--ink) bg-(--ink) text-white" : "border-(--line2) bg-white"
                  }`}
                >
                  {z === "back" ? shopTr("zoneBack") : shopTr("zoneFront")}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <PiecePreview product={product} format={format} face={faces[shownZone] ?? null} fit={fit} t={t} />
        <span className="text-sm text-(--muted2)">{t("previewLegend")}</span>
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="m-0 text-[26px] leading-tight font-extrabold sm:text-4xl">{product.name[lang]}</h1>
          <span className="text-base font-bold text-(--gold-ink)">{product.subtitle[lang]}</span>
          <p className="m-0 text-base leading-relaxed text-(--muted)">{product.description[lang]}</p>
          {product.leadTime ? <p className="m-0 text-sm font-semibold text-(--warn)">{product.leadTime[lang]}</p> : null}
          {editLine ? (
            <p role="status" className="m-0 rounded-xl bg-(--warn-soft) px-4 py-2.5 text-sm font-semibold text-(--warn)">
              {shopTr("editingLine")}
            </p>
          ) : null}
        </div>

        {product.formats.length > 1 ? (
          <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
            <legend className="mb-2.5 p-0 text-[15px] font-bold">{t("format")}</legend>
            <div className="flex flex-wrap gap-2.5">
              {product.formats.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={format.id === f.id}
                  onClick={() => {
                    setFormatId(f.id);
                    recheck(f);
                  }}
                  className={choiceClass(format.id === f.id)}
                >
                  <span className="font-bold">{f.name ?? `${f.trimMm.width}×${f.trimMm.height}`}</span>
                  {f.name ? <span className="text-xs opacity-80">{`${f.trimMm.width}×${f.trimMm.height} mm`}</span> : null}
                </button>
              ))}
            </div>
          </fieldset>
        ) : null}

        <section aria-labelledby="ps-size" className="flex flex-col gap-1.5 rounded-[14px] border-[1.5px] border-(--line2) p-4 text-sm">
          <b id="ps-size" className="text-[15px]">
            {t("sizeTitle")}
          </b>
          <span>{t("sizeFinished", { size: `${format.trimMm.width}×${format.trimMm.height}` })}</span>
          <span>
            {bleed > 0
              ? t("sizeFile", { size: `${fileMm.width}×${fileMm.height}`, b: bleed })
              : t("sizeFileNoBleed", { size: `${fileMm.width}×${fileMm.height}` })}
          </span>
          <span>{t("sizeSafe", { s: psSafeMm(product) })}</span>
          {product.fileNote ? <span>{product.fileNote[lang]}</span> : null}
          <span className="text-(--muted)">{pdfOnly ? t("sizePdfOnly") : t("sizeRes", { px: `${px.width}×${px.height}` })}</span>
          <a
            href={templateHref}
            download={`sablon-${product.slug}-${fileMm.width}x${fileMm.height}mm.svg`}
            className="mt-1 self-start font-semibold underline"
          >
            {t("template")}
          </a>
        </section>

        {product.papers.length > 1 ? (
          <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
            <legend className="mb-2.5 p-0 text-[15px] font-bold">{t("paper")}</legend>
            <div className="flex flex-wrap gap-2.5">
              {product.papers.map((g) => (
                <button key={g} type="button" aria-pressed={paper === g} onClick={() => setPaper(g)} className={choiceClass(paper === g)}>
                  <span className="font-bold">{t("paperGsm", { g })}</span>
                </button>
              ))}
            </div>
          </fieldset>
        ) : null}

        {product.sides.length > 1 ? (
          <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
            <legend className="mb-2.5 p-0 text-[15px] font-bold">{t("sides")}</legend>
            <div className="flex flex-wrap gap-2.5">
              {product.sides.map((s) => (
                <button key={s} type="button" aria-pressed={sides === s} onClick={() => setSides(s)} className={choiceClass(sides === s)}>
                  <span className="font-bold">{s === "two" ? t("sidesTwo") : t("sidesOne")}</span>
                </button>
              ))}
            </div>
          </fieldset>
        ) : null}

        {product.cut ? (
          <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
            <legend className="mb-2.5 p-0 text-[15px] font-bold">{t("cut")}</legend>
            <div className="flex flex-wrap gap-2.5">
              {[false, true].map((c) => (
                <button key={String(c)} type="button" aria-pressed={cut === c} onClick={() => setCut(c)} className={choiceClass(cut === c)}>
                  <span className="font-bold">{c ? t("cutYes") : t("cutNo")}</span>
                  <span className="text-xs opacity-80">
                    {formatPrice(c ? product.cut!.perPiece : product.pricing.kind === "fixed" ? (product.pricing.perPiece.one ?? 0) : 0, lang)}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>
        ) : null}

        <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
          <legend className="mb-2.5 p-0 text-[15px] font-bold">{t("pack")}</legend>
          <div className="flex flex-wrap gap-2.5">
            {product.packs.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={pack === n}
                onClick={() => setPack(n)}
                className={`min-h-11 rounded-[10px] border-[1.5px] px-4 font-bold ${
                  pack === n ? "border-(--ink) bg-(--ink) text-white" : "border-(--line2) bg-white"
                }`}
              >
                {sheets ? psSheetsText(n, lang) : t("packPcs", { n })}
              </button>
            ))}
          </div>
        </fieldset>

        {lamOffered.length ? (
          <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
            <legend className="mb-2.5 p-0 text-[15px] font-bold">{t("lamination")}</legend>
            <div className="flex flex-wrap gap-2.5">
              <button type="button" aria-pressed={lam == null} onClick={() => setLamination(null)} className={choiceClass(lam == null)}>
                <span className="font-bold">{t("laminationNone")}</span>
              </button>
              {lamOffered.map((l) => (
                <button key={l} type="button" aria-pressed={lam === l} onClick={() => setLamination(l)} className={choiceClass(lam === l)}>
                  <span className="font-bold">{l === "matte" ? t("laminationMatte") : t("laminationGloss")}</span>
                  <span className="text-xs opacity-80">
                    {t("laminationExtra", { price: formatPrice(psLaminationPerPiece(product, format, l) ?? 0, lang) })}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>
        ) : null}

        <div className="flex flex-col gap-2.5">
          {zones.map((z) => (
            <FaceUpload
              key={z}
              zone={z}
              label={faceLabel(z)}
              accept={pdfOnly ? ACCEPT_PDF : ACCEPT_ANY}
              product={product}
              format={format}
              value={faces[z]}
              onChange={(next) => {
                setFace(z, next);
                if (next?.status === "done" && next.previewUrl) urls.current.add(next.previewUrl);
                if (next) setPreviewZone(z);
              }}
            />
          ))}
          <span className={`text-sm ${hint && missing.length ? "font-semibold text-(--err)" : "text-(--muted2)"}`}>
            {hint && missing.length ? t("filesRequired") : pdfOnly ? t("filesNotePdf") : t("filesNote")}
          </span>
        </div>

        {showFit ? (
          <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
            <legend className="mb-2.5 p-0 text-[15px] font-bold">{t("fit")}</legend>
            <div className="flex flex-wrap gap-2.5">
              {(["cover", "contain"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={fit === f}
                  onClick={() => setFitChoice(f)}
                  className={`min-h-11 rounded-[10px] border-[1.5px] px-4 font-bold ${
                    fit === f ? "border-(--ink) bg-(--ink) text-white" : "border-(--line2) bg-white"
                  }`}
                >
                  {f === "contain" ? t("fitContain") : t("fitCover")}
                </button>
              ))}
            </div>
            <span className="text-sm text-(--muted2)">{t("fitHint")}</span>
          </fieldset>
        ) : null}

        <div className="flex flex-col gap-3.5 rounded-2xl bg-(--soft) p-5">
          <div className="flex min-h-[64px] flex-col justify-center gap-1" aria-live="polite" aria-busy={quote.status === "loading"}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-(--muted)">{shopTr("total")}</span>
              <span className={`text-[30px] font-extrabold sm:text-[34px] ${quote.status === "loading" ? "opacity-50" : ""}`}>
                {total != null ? formatPrice(total, lang) : "—"}
              </span>
            </div>
            {total != null ? (
              <span className="self-end text-sm text-(--muted2)">{psPerPieceText(total, pack, sheets, lang, (a) => formatPrice(a, lang))}</span>
            ) : null}
            {quote.status === "done" && !quote.line.ok ? <span className="text-sm text-(--err)">{shopTr("priceUnavailable")}</span> : null}
            {quote.status === "error" ? <span className="text-sm text-(--err)">{shopTr("priceError")}</span> : null}
            {quote.status === "loading" && quote.rateLimited ? <span className="text-sm text-(--muted2)">{shopTr("priceRetrying")}</span> : null}
          </div>
          <button
            type="button"
            onClick={() => void addToCart()}
            disabled={!canAdd}
            className="shop-btn-dark hidden rounded-xl bg-(--ink) py-4 text-[17px] font-extrabold disabled:opacity-50 md:block"
          >
            {added ? `✓ ${shopTr("addedToCart")}` : editLine ? shopTr("updateInCart") : shopTr("addToCart")}
          </button>
          <p aria-live="polite" className={`m-0 text-sm font-semibold ${added ? "" : "sr-only"}`}>
            {added ? (
              <>
                ✓ {shopTr("addedToCart")} — <Link href={href("/shop/cos")}>{shopTr("goToCart")}</Link>
              </>
            ) : null}
          </p>
          <div className="flex flex-col gap-2 text-sm text-(--muted)">
            <span>{product.leadTime ? product.leadTime[lang] : shopTr("readyIn")}</span>
            <span>{shopTr("deliveryLine")}</span>
            <span>{paymentLive ? shopTr("paymentLine") : shopTr("paymentLineSoon")}</span>
          </div>
        </div>
      </div>

      <AddedToast show={added} />

      <div className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-(--line) bg-white px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] md:hidden">
        <button
          type="button"
          onClick={() => void addToCart()}
          disabled={!canAdd}
          className="shop-btn-dark @container min-h-12 flex-1 rounded-xl bg-(--ink) px-3 py-1 text-base font-extrabold disabled:opacity-50"
        >
          <StickyCtaLabel
            label={added ? `✓ ${shopTr("addedToCart")}` : editLine ? shopTr("updateInCart") : shopTr("addToCartShort")}
            price={!added && total != null ? formatPrice(total, lang) : null}
          />
        </button>
      </div>
    </div>
  );
}

/** The piece at its file proportions with the face cropped / fitted as imposed, the cut line, the safe zone and a fold line. */
function PiecePreview({ product, format, face, fit, t }: { product: PsProduct; format: PsFormat; face: FaceState | null; fit: PsFit; t: PsT }) {
  const { width: W, height: H } = psFileMm(product, format);
  const pct = (mm: number, of: number) => `${(mm / of) * 100}%`;
  const trim: number = psBleedMm(product);
  const safe: number = trim + psSafeMm(product);
  const done = face?.status === "done" ? face : null;
  return (
    <div
      className="relative mx-auto w-full overflow-hidden rounded-md border border-(--line2) bg-white shadow-sm"
      style={{ aspectRatio: `${W} / ${H}`, maxWidth: H > W ? `${Math.round((W / H) * 560)}px` : undefined }}
    >
      {done?.previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- local object URL of the file just chosen
        <img src={done.previewUrl} alt="" className={`absolute inset-0 h-full w-full ${fit === "contain" ? "object-contain" : "object-cover"}`} />
      ) : (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-(--muted2)">
          {done ? (
            <span className="flex flex-col items-center gap-1">
              <b className="text-2xl text-(--muted)">{done.pdf ? "PDF" : "✓"}</b>
              <span className="max-w-[80%] truncate">{done.ref.fileName}</span>
            </span>
          ) : (
            t("previewEmpty")
          )}
        </div>
      )}
      {trim > 0 ? (
        <div
          aria-hidden
          className="pointer-events-none absolute border-[1.5px] border-[#e11d48]"
          style={{ left: pct(trim, W), right: pct(trim, W), top: pct(trim, H), bottom: pct(trim, H) }}
        />
      ) : null}
      <div
        aria-hidden
        className="pointer-events-none absolute border-[1.5px] border-dashed border-[#2563eb]"
        style={{ left: pct(safe, W), right: pct(safe, W), top: pct(safe, H), bottom: pct(safe, H) }}
      />
      {format.foldHalf ? <div aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 border-t-[1.5px] border-dashed border-[#16a34a]" /> : null}
    </div>
  );
}

function checkText(
  check: PsArtworkCheck | null,
  pdf: boolean,
  product: PsProduct,
  format: PsFormat,
  t: PsT,
  lang: ShopLang,
): { text: string; warn: boolean } | null {
  const px = psExpectedPx(product, format);
  const file = psFileMm(product, format);
  const sizeText = `${file.width}×${file.height}`;
  if (!check) return pdf ? { text: t("checkPdfUnknown"), warn: false } : null;
  const size = check.sizeMm ? { w: check.sizeMm.width, h: check.sizeMm.height } : { w: "?", h: "?" };
  if (check.ok) {
    return pdf
      ? { text: t("checkOkPdf", size), warn: false }
      : { text: t("checkOkImage", { w: check.px?.width ?? "?", h: check.px?.height ?? "?", dpi: check.dpi ?? "?" }), warn: false };
  }
  const parts: string[] = check.issues.map((issue) => {
    switch (issue) {
      case "no_bleed":
        return t("checkNoBleed");
      case "wrong_proportions":
        return t(psProportionsKey(product), { size: sizeText });
      case "too_small":
        return t("checkTooSmall", { ...size, size: sizeText });
      case "low_dpi":
        return t("checkLowDpi", { dpi: check.dpi ?? "?", px: `${px.width}×${px.height}` });
      case "pages":
        return t("checkPages", { pages: psPagesText(check.pages, lang), need: product.pagesPerPiece ?? 1 });
    }
  });
  return { text: parts.join(" "), warn: true };
}

function FaceUpload({
  zone,
  label,
  accept,
  product,
  format,
  value,
  onChange,
}: {
  zone: PsZone;
  label: string;
  accept: string;
  product: PsProduct;
  format: PsFormat;
  value: FaceState | null;
  onChange: (next: FaceState | null) => void;
}) {
  const { t: shopTr, lang } = useShopLang();
  const t: PsT = psT(lang);
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const token = useRef(0);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const my = ++token.current;
    onChange({ status: "uploading", name: file.name, pct: 0 });
    const pdf: boolean = isPdfFile(file);
    const measure: Promise<PsArtworkCheck | null> = pdf
      ? readPdfFacts(file).then((facts) => psCheckArtwork(product, format, facts))
      : readImageSize(file).then((size) => psCheckArtwork(product, format, { px: size }));
    try {
      const ref = await uploadArtwork(file, (pct) => {
        if (token.current === my) onChange({ status: "uploading", name: file.name, pct });
      });
      const [check, thumb] = await Promise.all([measure, pdf ? Promise.resolve(null) : makeFaceThumb(file)]);
      if (token.current !== my) return;
      const lowRes: boolean = check?.issues.includes("low_dpi") ?? false;
      onChange({
        status: "done",
        ref: { ...ref, zone, ...(lowRes ? { lowRes: true } : {}), ...(thumb ? { thumb } : {}) },
        check,
        previewUrl: pdf ? null : URL.createObjectURL(file),
        pdf,
      });
    } catch (e) {
      if (token.current !== my) return;
      onChange({
        status: "error",
        name: file.name,
        message: e instanceof ShopUploadError && e.code === "too_big" ? shopTr("uploadTooBig") : shopTr("uploadFailed"),
      });
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const note = value?.status === "done" ? checkText(value.check, value.pdf, product, format, t, lang) : null;

  return (
    <div id={`shop-ps-file-${zone}`} className="flex flex-col gap-2 rounded-[14px] border-[1.5px] border-(--line2) p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-(--muted)">
          <UploadIcon size={22} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <b>{label}</b>
          {value == null ? <span className="text-sm leading-snug text-(--muted)">{shopTr("uploadOwnText")}</span> : null}
          {value?.status === "uploading" ? (
            <span className="text-sm text-(--muted)" aria-live="polite">
              <span className="block truncate">{value.name}</span>
              {shopTr("uploading", { pct: value.pct })}
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
          {value?.status === "done" ? shopTr("uploadReplace") : shopTr("uploadChoose")}
          <input ref={inputRef} id={inputId} type="file" accept={accept} className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
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
            {shopTr("uploadRemove")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
