"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { blobToFile } from "@/lib/mug/exportLayout";
import {
  SHOP_BC_BACK_PER_CARD_MDL,
  SHOP_BC_CORNERS_EXTRA_MDL,
  SHOP_BC_DEFAULT_PACK,
  SHOP_BC_IMAGE,
  SHOP_BC_LAMINATION_EXTRA_MDL,
  SHOP_BC_PACKS,
  isShopBcPack,
  type ShopBcLamination,
} from "@/lib/storefront/businessCards";
import { newLineId, type CartLine } from "@/lib/storefront/cart";
import { dispatchCart, refuseIfCartFull } from "@/lib/storefront/cartStore";
import type { ShopLineStudio } from "@/lib/storefront/design";
import { formatPrice } from "@/lib/storefront/format";
import { buildLineLabels, describeQuoteLine } from "@/lib/storefront/lineLabels";
import { useLiveQuote } from "@/lib/storefront/quoteClient";
import type { ShopQuoteLine } from "@/lib/storefront/types";
import { uploadArtwork } from "@/lib/storefront/upload";
import { addCardBack, cardDesignCartLine, cardHasBack, cardQuoteLine, removeCardBack, type CardBackStart, type CardSideFile } from "@/lib/studio/cardLine";
import { cardShortWithAutoBack, sheetAutoBack, sheetFieldsNotShown, type CardShortState } from "@/lib/studio/cardFlow";
import {
  docFitsSpec,
  flyerDesignCartLine,
  flyerFormat,
  flyerListTotal,
  flyerOptionsOfQuote,
  flyerProduct,
  flyerQuoteLine,
  sheetSizeKey,
  type FlyerFormatId,
  type FlyerOrderOptions,
} from "@/lib/studio/flyer";
import { studioFlyerT, studioSheetT } from "@/lib/studio/i18n.flyer";
import type { PsLamination } from "@/lib/storefront/printShop/config";
import type { StudioDoc } from "@/lib/studio/document";
import { CART_SIDE_THUMB_PX, CART_THUMB_PX, CART_THUMB_QUALITIES, exportStudioPng, renderPreviewCanvas, studioThumbnail } from "@/lib/studio/exportClient";
import { fitAllTextBoxes } from "@/lib/studio/fonts";
import { studioCardT } from "@/lib/studio/i18n.card";
import { studioShopT } from "@/lib/studio/i18n.shop";
import { studioViewsT } from "@/lib/studio/i18n.views";
import { toLegacyLayout } from "@/lib/studio/legacy";
import { studioQualityMessage } from "@/lib/studio/quality";
import { applyStudioFields, fieldsFromDoc, mergeStudioFields, type StudioFields } from "@/lib/studio/smartFields";
import { saveDoc } from "@/lib/studio/storage";
import { CARD_BACK_ID, CARD_FRONT_ID, type SheetStudioKind, type StudioSurfaceSpec } from "@/lib/studio/surfaces";
import { studioBackTemplates, studioTemplateById, type StudioTemplate } from "@/lib/studio/templates";
import { studioApprovalChecks, studioVerifyNotes } from "@/lib/studio/verifyChecklist";
import { useShopLang } from "../ShopLangProvider";
import type { StudioEditorApi } from "./StudioApp";
import { PICTURE_BG, StudioLivePicture, productThumbnail, useStableAssets, useStudioProductLook } from "./StudioProductPicture";
import type { StudioQualityState } from "./StudioQuality";
import { Icon, STUDIO_ICONS } from "./StudioUi";
import { StudioCartProgressLine, StudioPhotosMissing, uploadStudioPhotos } from "./StudioVerify";
import { FlyerFormatChips, SheetRecalculating, flyerFormatOfSpecs, useSheetSidePrices } from "./StudioFlyer";
import { SheetFieldsNotShownNote } from "./StudioCardFields";
import type { StudioCartProgress } from "@/lib/studio/cartProgress";

/**
 * ANVI Studio for business cards (`card`, staff / tester only — `flag.ts`):
 * the «Față / Verso» switch with «Adaugă verso» and «Verifică» with the
 * pack, finishing, the empty-field list and the approval (the start screen
 * and the gallery: StudioCardGallery.tsx; «Editare rapidă»: StudioCardShort.tsx). The cart line is the ordinary business-card pack
 * with one 300 dpi PNG per side (`cardLine.ts`).
 *
 * Flyers (`flyer`) use the same screens: their wording (`studioSheetT`), the
 * back's price as the live two-sided total minus the one-sided one, and in
 * «Verifică» the print-shop flyer options (format, paper, pack, lamination)
 * and line (`flyer.ts`).
 */

const sideName = (lang: StudioEditorApi["lang"], id: string) => studioCardT(lang)(id === CARD_BACK_ID ? "back" : "front");
const sheetKindOf = (api: Pick<StudioEditorApi, "kind">): SheetStudioKind => (api.kind === "flyer" ? "flyer" : "card");

// ─── «Față / Verso» ─────────────────────────────────────────────────────

export function StudioCardSideBar({ api, fields }: { api: StudioEditorApi; fields: StudioFields }) {
  const kind: SheetStudioKind = api.kind === "flyer" ? "flyer" : "card";
  const t = studioSheetT(kind, api.lang);
  const [chooser, setChooser] = useState(false);
  const hasBack: boolean = cardHasBack(api.doc);
  const onBack: boolean = api.spec.id === CARD_BACK_ID;
  // Cards: the fixed «+0,50 lei/buc.» (no quote); flyers: what the back adds to the default pack.
  const extra: string = useSheetSidePrices(kind, api.lang, flyerFormatOfSpecs(api.specs), kind === "flyer").extra ?? "…";
  const tab = (on: boolean) => `flex min-h-10 items-center gap-1.5 rounded-[9px] px-3 text-sm font-bold whitespace-nowrap ${on ? "bg-(--ink) text-white" : "text-(--ink)"}`;
  return (
    <>
      <div role="group" aria-label={t("sides")} data-studio-card-sides className="flex items-center gap-1 rounded-[11px] border border-(--line) bg-white p-1 shadow-[0_2px_10px_rgba(20,33,61,0.12)]">
        <button type="button" aria-pressed={!onBack} data-studio-side="front" className={tab(!onBack)} onClick={() => api.setSurface(CARD_FRONT_ID)}>
          {t("front")}
        </button>
        {hasBack ? (
          <>
            <button type="button" aria-pressed={onBack} data-studio-side="back" className={tab(onBack)} onClick={() => api.setSurface(CARD_BACK_ID)}>
              {t("back")}
            </button>
            {onBack ? (
              <button
                type="button"
                data-studio-remove-back
                aria-label={t("removeBack")}
                title={t("removeBack")}
                className="flex h-10 w-10 items-center justify-center rounded-[9px] text-[#a82e22]"
                onClick={() => {
                  if (!window.confirm(t("removeBackConfirm"))) return;
                  api.setSurface(CARD_FRONT_ID);
                  api.setDoc(removeCardBack(api.doc));
                }}
              >
                <Icon d={STUDIO_ICONS.trash} size={18} />
              </button>
            ) : null}
          </>
        ) : (
          <button type="button" data-studio-add-back className={`${tab(false)} border border-dashed border-(--line2)`} onClick={() => setChooser(true)}>
            <span aria-hidden="true">+</span>
            {t("addBack")}
            <span className="text-xs font-semibold text-(--muted)">{t("addBackPrice", { price: extra })}</span>
          </button>
        )}
      </div>
      {chooser ? (
        <CardBackChooser
          api={api}
          fields={fields}
          extra={extra}
          onClose={() => setChooser(false)}
          onPick={(start) => {
            const next: StudioDoc = fitAllTextBoxes(addCardBack(api.doc, api.specs, start, api.lang, fields), "bound");
            api.setDoc(next);
            api.setSurface(CARD_BACK_ID);
            setChooser(false);
          }}
        />
      ) : null}
    </>
  );
}

/** «Adaugă verso»: copy the front's style, blank, or one of the back templates. */
function CardBackChooser({ api, fields, extra, onClose, onPick }: { api: StudioEditorApi; fields: StudioFields; extra: string; onClose: () => void; onPick: (s: CardBackStart) => void }) {
  const kind: SheetStudioKind = api.kind === "flyer" ? "flyer" : "card";
  const t = studioSheetT(kind, api.lang);
  const backSpec: StudioSurfaceSpec | undefined = api.specs.find((s) => s.id === CARD_BACK_ID);
  const look = useStudioProductLook(api);
  const assets = useStableAssets(api.renderAssets);
  const templates: StudioTemplate[] = useMemo(() => studioBackTemplates(kind), [kind]);
  // Each option drawn as the back it makes (the back spec, the customer's details).
  const previews = useMemo(() => {
    if (!backSpec) return [];
    const asDoc = (start: CardBackStart): StudioDoc => {
      const d = addCardBack(removeCardBack(api.doc), api.specs, start, api.lang, fields);
      return { ...d, surfaces: d.surfaces.filter((s) => s.id === CARD_BACK_ID) };
    };
    return [
      { key: "copy", label: t("backCopy"), sub: t("backCopySub"), start: { kind: "copy" } as CardBackStart, doc: asDoc({ kind: "copy" }) },
      { key: "blank", label: t("backBlank"), sub: t("backBlankSub"), start: { kind: "blank" } as CardBackStart, doc: asDoc({ kind: "blank" }) },
      ...templates.map((tpl) => ({ key: tpl.id, label: tpl.name[api.lang], sub: t("backTemplates"), start: { kind: "template", template: tpl } as CardBackStart, doc: asDoc({ kind: "template", template: tpl }) })),
    ];
  }, [api.doc, api.specs, api.lang, fields, templates, backSpec, t]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!backSpec) return null;
  // On the body: the sides bar sits in a transformed box, which would hold a `fixed` dialog inside it.
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[rgba(20,33,61,0.45)] md:items-center" role="dialog" aria-modal="true" aria-labelledby="studio-back-title" data-studio-back-chooser>
      <div className="flex max-h-[90vh] w-full max-w-[760px] flex-col gap-3 overflow-y-auto rounded-t-2xl bg-white p-4 md:rounded-2xl md:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 id="studio-back-title" className="m-0 text-xl font-extrabold">
              {t("backTitle")}
            </h2>
            <p className="m-0 text-sm text-(--muted)">{t("backLead", { price: kind === "flyer" ? extra : formatPrice(SHOP_BC_BACK_PER_CARD_MDL, api.lang) })}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t("cancel")} className="flex h-11 w-11 flex-none items-center justify-center rounded-[10px] bg-(--soft)">
            <Icon d={STUDIO_ICONS.close} />
          </button>
        </div>
        <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-4">
          {previews.map((p) => (
            <li key={p.key} className="min-w-0">
              <button
                type="button"
                data-studio-back-option={p.key}
                onClick={() => onPick(p.start)}
                className="flex w-full flex-col gap-1.5 rounded-xl border-[1.5px] border-(--line) p-1.5 text-left hover:border-(--ink)"
              >
                <StudioLivePicture doc={p.doc} spec={backSpec} assets={assets} look={look} version={api.version} label={p.label} />
                <b className="truncate px-0.5 text-[13px]">{p.label}</b>
                <span className="px-0.5 text-[11px] leading-snug text-(--muted)">{p.sub}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  );
}

/** «Datele mele» applied to the card the customer starts from (fields typed on the start screen). */
export function cardWithFields(doc: StudioDoc, fields: StudioFields): StudioDoc {
  return fitAllTextBoxes(applyStudioFields(doc, fields), "bound");
}

// ─── Verify ─────────────────────────────────────────────────────────────

/**
 * One side as printed (no samples): the card as it comes off the cutter, flat
 * with a soft shadow — or (`cut`) the whole file with the red cut line.
 */
function CardSidePreview({ api, spec, label, cut, pending = false }: { api: StudioEditorApi; spec: StudioSurfaceSpec; label: string; cut: boolean; pending?: boolean }) {
  // The picture and the size it was drawn at: another format's picture is never shown stretched.
  const [drawn, setDrawn] = useState<{ url: string; size: string } | null>(null);
  const { doc, renderAssets, version } = api;
  const size: string = sheetSizeKey(spec);
  // Another format picked: nothing is drawn until the document is laid out for it.
  const waiting: boolean = pending || !docFitsSpec(doc, spec);
  useEffect(() => {
    if (waiting) return;
    const c = renderPreviewCanvas(doc, spec, renderAssets, 1100, null, true);
    setDrawn({ url: c.toDataURL("image/png"), size: sheetSizeKey(spec) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- redraw on version (doc, photos, fonts)
  }, [version, spec, waiting]);
  const url: string | null = drawn && drawn.size === size && !waiting ? drawn.url : null;
  const bx: number = (spec.bleedMm / spec.widthMm) * 100;
  const by: number = (spec.bleedMm / spec.heightMm) * 100;
  const tw: number = spec.widthMm - 2 * spec.bleedMm;
  const th: number = spec.heightMm - 2 * spec.bleedMm;
  return (
    <figure className="m-0 flex flex-col gap-1.5" data-studio-card-preview={spec.id}>
      <figcaption className="sr-only">{label}</figcaption>
      {cut ? (
        <div className="relative w-full overflow-hidden rounded-lg border border-(--line) bg-white" style={{ aspectRatio: `${spec.widthMm} / ${spec.heightMm}` }}>
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- generated data URL
            <img src={url} alt={label} className="h-full w-full" />
          ) : null}
          {waiting ? <SheetRecalculating lang={api.lang} /> : null}
          {/* Outside the cut: shaded; the red line is the cut. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute border-[1.5px] border-[#e11d48]"
            style={{ left: `${bx}%`, right: `${bx}%`, top: `${by}%`, bottom: `${by}%`, boxShadow: "0 0 0 999px rgba(255,255,255,0.45)" }}
          />
        </div>
      ) : (
        <div className="rounded-2xl px-[8%] py-[7%]" style={{ background: PICTURE_BG }}>
          <div className="relative w-full overflow-hidden rounded-[4px] bg-white shadow-[0_12px_30px_rgba(20,33,61,0.22)]" style={{ aspectRatio: `${tw} / ${th}` }}>
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element -- generated data URL
              <img
                src={url}
                alt={label}
                className="absolute max-w-none"
                style={{
                  width: `${(spec.widthMm / tw) * 100}%`,
                  height: `${(spec.heightMm / th) * 100}%`,
                  left: `${(-spec.bleedMm / tw) * 100}%`,
                  top: `${(-spec.bleedMm / th) * 100}%`,
                }}
              />
            ) : null}
            {waiting ? <SheetRecalculating lang={api.lang} /> : null}
          </div>
        </div>
      )}
    </figure>
  );
}

/** The card's sides (Față / Verso switch when it has a back) and «Arată marginile de tăiere». */
function CardVerifyPreview({ api, sideSpecs, sideId, onSide, pending }: { api: StudioEditorApi; sideSpecs: StudioSurfaceSpec[]; sideId: string; onSide: (id: string) => void; pending: boolean }) {
  const t = studioSheetT(sheetKindOf(api), api.lang);
  const setSideId = onSide;
  const [cut, setCut] = useState(false);
  const spec: StudioSurfaceSpec | undefined = sideSpecs.find((s) => s.id === sideId) ?? sideSpecs[0];
  if (!spec) return null;
  const tab = (on: boolean) => `flex min-h-11 items-center rounded-[9px] px-4 text-sm font-bold whitespace-nowrap ${on ? "bg-(--ink) text-white" : "text-(--ink)"}`;
  return (
    <div className="flex flex-col gap-2">
      {sideSpecs.length > 1 ? (
        <div role="group" aria-label={t("sides")} data-studio-card-verify-sides className="flex items-center gap-1 self-start rounded-[11px] border border-(--line) bg-white p-1">
          {sideSpecs.map((s) => (
            <button key={s.id} type="button" aria-pressed={spec.id === s.id} data-studio-side={s.id === CARD_BACK_ID ? "back" : "front"} className={tab(spec.id === s.id)} onClick={() => setSideId(s.id)}>
              {sideName(api.lang, s.id)}
            </button>
          ))}
        </div>
      ) : null}
      {api.kind === "flyer" ? (
        // A portrait sheet: not taller than the screen.
        <div className="mx-auto w-full max-w-[min(100%,460px)]">
          <CardSidePreview api={api} spec={spec} label={sideName(api.lang, spec.id)} cut={cut} pending={pending} />
        </div>
      ) : (
        <CardSidePreview api={api} spec={spec} label={sideName(api.lang, spec.id)} cut={cut} pending={pending} />
      )}
      <label className="flex min-h-11 items-center gap-2 self-start text-sm font-semibold">
        <input type="checkbox" checked={cut} onChange={(e) => setCut(e.target.checked)} className="h-5 w-5 accent-(--ink)" data-studio-card-show-cut />
        {t("showCut")}
      </label>
      {cut ? <p className="m-0 text-xs text-(--muted2)">{t("cutNote", { size: `${Math.round(spec.widthMm - 2 * spec.bleedMm)}×${Math.round(spec.heightMm - 2 * spec.bleedMm)} mm` })}</p> : null}
    </div>
  );
}

export function StudioCardVerify({
  api,
  quality,
  editLine,
  onBack,
  onAdded,
  short = null,
  onShort,
  onFormat,
  fields = {},
  relayout = false,
  onEditBack,
}: {
  api: StudioEditorApi;
  quality: StudioQualityState;
  editLine: CartLine | null;
  onBack: () => void;
  /** The line now in the cart (the «added» screen shows it). */
  onAdded: (doc: StudioDoc, line: CartLine) => void;
  /** The short edit's picks when the card was made there (kept with the design: «Editează» from the cart opens it there again). */
  short?: CardShortState | null;
  /** Flyers: the back turned on / off here (a short-edit flyer: its picks; the page re-draws the document). */
  onShort?: (s: CardShortState) => void;
  /** Flyers: another format (the page passes the new print size). */
  onFormat?: (f: FlyerFormatId) => void;
  /** «Datele mele» as typed (the details this design leaves out are listed; an added back is filled with them). */
  fields?: StudioFields;
  /** The page is re-drawing the document from the short edit's picks (another format / the back turned on): nothing to add yet. */
  relayout?: boolean;
  /** «Editează versoul» under a back added here: back to the editor on the back. */
  onEditBack?: () => void;
}) {
  const { t: shopT, lang } = useShopLang();
  const kind: SheetStudioKind = api.kind === "flyer" ? "flyer" : "card";
  const isFlyer: boolean = kind === "flyer";
  const t = studioSheetT(kind, lang);
  const st = studioShopT(lang);
  const vt = studioViewsT(lang);
  // Flyers: the print-shop options (from the cart line being edited, else the product's defaults).
  const editFlyer: FlyerOrderOptions | null = isFlyer ? flyerOptionsOfQuote(editLine?.quote) : null;
  const format: FlyerFormatId = flyerFormatOfSpecs(api.specs);
  const [paper, setPaper] = useState<number>(editFlyer?.paper ?? flyerProduct().defaultPaper ?? flyerProduct().papers[0]!);
  const [flyerPack, setFlyerPack] = useState<number>(editFlyer?.pack ?? flyerProduct().defaultPack);
  const [flyerLam, setFlyerLam] = useState<PsLamination | null>(editFlyer?.lamination ?? null);
  const editQuote = editLine?.quote.kind === "businessCard" ? editLine.quote : null;
  const [pack, setPack] = useState<number>(editQuote && isShopBcPack(editQuote.quantity) ? editQuote.quantity : SHOP_BC_DEFAULT_PACK);
  const [lamination, setLamination] = useState<ShopBcLamination | null>(editQuote?.lamination ?? null);
  const [corners, setCorners] = useState<boolean>(editQuote?.corners ?? false);
  const [approved, setApproved] = useState(false);
  const [saving, setSaving] = useState<StudioCartProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const look = useStudioProductLook(api);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    root.current?.scrollIntoView({ block: "start" });
  }, []);
  const quoteLine: ShopQuoteLine = useMemo(
    () =>
      isFlyer
        ? (flyerQuoteLine(api.doc, { format, paper, pack: flyerPack, lamination: flyerLam }) as ShopQuoteLine)
        : cardQuoteLine(api.doc, { pack, lamination, corners }),
    [isFlyer, api.doc, format, paper, flyerPack, flyerLam, pack, lamination, corners],
  );
  const quote = useLiveQuote(quoteLine, lang);
  const ok = quote.status === "done" && quote.line.ok ? quote.line : quote.status === "loading" && quote.previous?.ok ? quote.previous : null;
  // The document is still the previous format / sides for a moment after a pick here.
  const stale: boolean = relayout || api.specs.some((sp) => !docFitsSpec(api.doc, sp));
  // Flyers: the list price of the options as picked (the sides as asked for, before the document follows) —
  // at once, never the previous format's; the live quote still says when the server cannot price it.
  const wantBack: boolean = short && isFlyer ? short.backId != null : cardHasBack(api.doc);
  const flyerTotal: number | null = isFlyer
    ? flyerListTotal(flyerQuoteLine(wantBack ? { surfaces: [{ id: CARD_BACK_ID } as StudioDoc["surfaces"][number]] } : { surfaces: [] }, { format, paper, pack: flyerPack, lamination: flyerLam }) as ShopQuoteLine)
    : null;
  const failed: boolean = quote.status === "done" && !quote.line.ok;
  const total: number | null = isFlyer ? (failed ? null : flyerTotal) : ok ? ok.total : null;
  const unit: number | null = isFlyer ? (total != null ? Math.round((total / flyerPack) * 100) / 100 : null) : ok ? ok.unitPrice : null;
  const notes = useMemo(() => studioVerifyNotes(api.doc), [api.doc]);
  const empties = notes.notPrinted.filter((n) => n.what === "sampleText");
  const others = notes.notPrinted.filter((n) => n.what !== "sampleText");
  const sideSpecs: StudioSurfaceSpec[] = api.specs.filter((s) => api.doc.surfaces.some((d) => d.id === s.id));
  const surfaceOfLayer = (id: string): string => api.doc.surfaces.find((s) => s.layers.some((l) => l.id === id))?.id ?? CARD_FRONT_ID;
  const canAdd: boolean = approved && !quality.blocks && saving == null && !failed && !stale;
  // The side shown; a back added here (the customer never saw it) is shown at once, with a note.
  const [sideId, setSideId] = useState<string>(CARD_FRONT_ID);
  const [autoBack, setAutoBack] = useState(false);
  const hasBackNow: boolean = cardHasBack(api.doc);
  const notShown = useMemo(() => sheetFieldsNotShown(api.doc, fields, kind), [api.doc, fields, kind]);
  const labels = useMemo(() => buildLineLabels([api.product]), [api.product]);

  const add = async () => {
    if (!canAdd) return;
    if (!editLine && refuseIfCartFull()) return;
    setError(null);
    setSaving({ stage: "render", pct: null });
    try {
      const doc: StudioDoc = await uploadStudioPhotos(api, setSaving);
      setSaving({ stage: "render", pct: null });
      const ex = await api.assets.exportAssets(doc);
      if (ex.missing.length) {
        ex.release();
        throw new StudioPhotosMissing();
      }
      // One 300 dpi PNG per printed side (card 94×54 mm = 1110×638 px; flyer A5 152×214 mm = 1795×2528 px), the front's thumbnails.
      const pngs: { id: string; blob: Blob; thumb: string | null }[] = [];
      let cartThumb: string | null = null;
      let preview: string | null = null;
      try {
        for (const spec of sideSpecs) {
          const { blob, canvas } = await exportStudioPng(doc, spec, ex.assets);
          if (spec.id === CARD_FRONT_ID) {
            // The cart image (small: it lives in `localStorage`); the approval preview sent to the order stays as it was.
            cartThumb =
              productThumbnail(canvas, spec, look, doc, CART_THUMB_PX, CART_THUMB_QUALITIES) ??
              studioThumbnail(canvas, CART_THUMB_PX, "#ffffff", CART_THUMB_QUALITIES);
            preview = studioThumbnail(canvas, 240);
          }
          // The back as cut, small (the «added to cart» screen); the front's picture is the line image.
          pngs.push({
            id: spec.id,
            blob,
            thumb:
              spec.id === CARD_FRONT_ID
                ? null
                : (productThumbnail(canvas, spec, look, doc, CART_SIDE_THUMB_PX, CART_THUMB_QUALITIES) ??
                  studioThumbnail(canvas, CART_SIDE_THUMB_PX, "#ffffff", CART_THUMB_QUALITIES)),
          });
          canvas.width = 0;
          canvas.height = 0;
        }
      } finally {
        ex.release();
      }
      const files: Record<string, CardSideFile> = {};
      for (const [i, p] of pngs.entries()) {
        setSaving({ stage: "upload", pct: null });
        const ref = await uploadArtwork(blobToFile(p.blob, `${kind}-${p.id}-${Date.now()}.png`), (pct) =>
          setSaving({ stage: "upload", pct: Math.round(((i + pct / 100) / pngs.length) * 100) }),
        );
        files[p.id] = { ...ref, thumb: p.thumb };
      }
      setSaving({ stage: "save", pct: null });
      const studio: ShopLineStudio = {
        v: 1,
        docId: doc.id,
        approvedAt: new Date().toISOString(),
        checks: studioApprovalChecks(),
        ...(preview && preview.length <= 60_000 ? { preview } : {}),
        ...(doc.templateId ? { templateId: doc.templateId } : {}),
      };
      await saveDoc({
        id: doc.id,
        kind,
        doc,
        preview: cartThumb,
        slug: api.product.slug,
        variantId: null,
        cartedAt: Date.parse(studio.approvedAt),
        ...(short ? { step: "cardShort" as const, cardShort: short } : {}),
      });
      const text = describeQuoteLine(quoteLine, labels, shopT);
      const lineArgs = {
        id: editLine?.id ?? newLineId(),
        addedAt: editLine?.addedAt ?? Date.now(),
        front: files[CARD_FRONT_ID]!,
        back: files[CARD_BACK_ID] ?? null,
        layout: toLegacyLayout(doc),
        preview: cartThumb,
        studio,
        title: text?.title ?? api.product.name,
        optionsText: text?.optionsText ?? "",
        lastTotal: total,
      };
      const line: CartLine = isFlyer
        ? flyerDesignCartLine({
            ...lineArgs,
            // The line priced on this screen, with the sides of the exported document.
            quote: flyerQuoteLine(doc, { format, paper, pack: flyerPack, lamination: flyerLam }),
            fallbackImage: flyerProduct().image,
          })
        : cardDesignCartLine({ ...lineArgs, quote: quoteLine, fallbackImage: SHOP_BC_IMAGE });
      if (!dispatchCart(editLine ? { type: "update", line } : { type: "add", line })) {
        setSaving(null);
        return;
      }
      api.replaceDoc(doc);
      setSaving(null);
      onAdded(doc, line);
    } catch (e) {
      console.error("[studio] card add to cart failed:", e);
      setError(e instanceof StudioPhotosMissing ? st("photosMissing") : st("saveFailed"));
      setSaving(null);
    }
  };

  const chip = (on: boolean) => `min-h-11 rounded-xl border-[1.5px] px-3 text-sm font-bold ${on ? "border-(--ink) bg-(--ink) text-white" : "border-(--line2) bg-white text-(--ink)"}`;
  return (
    <div ref={root} className="mx-auto grid w-full max-w-[1180px] items-start gap-5 px-4 py-5 md:px-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-8" data-studio-card-verify>
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-2xl leading-tight font-extrabold md:text-3xl">{t("verifyTitle")}</h1>
          <p className="m-0 text-sm text-(--muted)">{t("verifyLead")}</p>
        </div>
        {autoBack && hasBackNow ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#e8f1fb] px-3 py-2 text-sm" data-studio-auto-back-note>
            <span className="font-semibold text-[#1d4f86]">{t("autoBackNote")}</span>
            {onEditBack ? (
              <button type="button" data-studio-edit-back disabled={saving != null} onClick={onEditBack} className="min-h-11 rounded-lg px-2 font-bold underline underline-offset-2">
                {t("editBack")}
              </button>
            ) : null}
          </div>
        ) : null}
        <CardVerifyPreview api={api} sideSpecs={sideSpecs} sideId={sideId} onSide={setSideId} pending={stale} />
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <b className="text-lg">{api.product.name}</b>
        {isFlyer ? (
          <FlyerOptions
            api={api}
            short={short}
            fields={fields}
            onBackAdded={(added) => {
              // «Pe ambele fețe»: the new back on screen (with the note); one side again: the front.
              setAutoBack(added);
              setSideId(added ? CARD_BACK_ID : CARD_FRONT_ID);
            }}
            onShort={onShort}
            onFormat={onFormat}
            paper={paper}
            onPaper={setPaper}
            pack={flyerPack}
            onPack={setFlyerPack}
            lamination={flyerLam}
            onLamination={setFlyerLam}
            chip={chip}
            disabled={saving != null}
            wantBack={wantBack}
          />
        ) : (
          <>
        <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
          <legend className="mb-2 p-0 text-[15px] font-bold">{shopT("bcPack")}</legend>
          <div className="flex flex-wrap gap-2">
            {SHOP_BC_PACKS.map((n) => (
              <button key={n} type="button" aria-pressed={pack === n} data-studio-card-pack={n} className={chip(pack === n)} onClick={() => setPack(n)}>
                {shopT("bcPackOption", { n })}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-col gap-1 text-sm">
          <b className="text-[15px]">{shopT("bcSides")}</b>
          <span className="text-(--muted)">
            {cardHasBack(api.doc)
              ? `${shopT("bcSidesTwo")} (${shopT("bcSidesExtra", { price: formatPrice(SHOP_BC_BACK_PER_CARD_MDL, lang) })})`
              : shopT("bcSidesOne")}
          </span>
        </div>
        <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
          <legend className="mb-2 p-0 text-[15px] font-bold">{shopT("bcFinishing")}</legend>
          <div className="flex flex-wrap gap-2">
            {([null, "gloss", "matte"] as const).map((v) => (
              <button key={v ?? "none"} type="button" aria-pressed={lamination === v} className={chip(lamination === v)} onClick={() => setLamination(v)}>
                {shopT(v === "gloss" ? "bcLaminationGloss" : v === "matte" ? "bcLaminationMatte" : "bcLaminationNone")}
                {v ? <span className="ml-1 text-xs opacity-75">{shopT("bcOptionExtra", { price: formatPrice(SHOP_BC_LAMINATION_EXTRA_MDL, lang) })}</span> : null}
              </button>
            ))}
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={corners} onChange={(e) => setCorners(e.target.checked)} className="h-5 w-5 accent-(--ink)" />
            {shopT("bcCorners")}
            <span className="text-xs text-(--muted)">{shopT("bcOptionExtra", { price: formatPrice(SHOP_BC_CORNERS_EXTRA_MDL, lang) })}</span>
          </label>
        </fieldset>
          </>
        )}
        <div className="flex flex-col gap-1 border-t border-(--line) pt-3">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-(--muted)">{t("perCard")}</span>
            <span className="font-bold">{unit != null ? formatPrice(unit, lang) : failed ? "—" : "…"}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <b>{t("total")}</b>
            <b className="text-2xl" aria-live="polite" data-studio-total>
              {total != null ? formatPrice(total, lang) : failed ? "—" : "…"}
            </b>
          </div>
          {stale ? (
            <div className="flex items-center justify-end gap-1.5 text-xs text-(--muted)" role="status" data-studio-verify-recalculating>
              <span aria-hidden="true" className="h-3 w-3 animate-spin rounded-full border-2 border-(--line2) border-t-(--ink)" />
              {t("recalculating")}
            </div>
          ) : null}
        </div>
        {failed ? (
          <span role="alert" className="text-sm text-(--err)">
            {st("priceUnavailable")}
          </span>
        ) : null}

        <section className="m-0 flex flex-col gap-2 rounded-2xl border-[1.5px] border-(--line) p-3" data-studio-checklist>
          <div className="flex flex-col gap-1 text-sm" data-studio-card-empty>
            <b className="text-xs font-extrabold tracking-wide text-(--muted2) uppercase">{t("emptyTitle")}</b>
            {empties.length === 0 ? (
              <span className="font-semibold text-[#1f8a4c]">✓ {t("emptyNone")}</span>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {empties.map((n) => (
                  <li key={n.layerId} className="flex items-center justify-between gap-2">
                    <span>{t("sideOf", { side: sideName(lang, n.surfaceId ?? CARD_FRONT_ID), what: `«${n.text ?? ""}»` })}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <SheetFieldsNotShownNote lang={lang} kind={kind} keys={notShown} hint={null} />
          {others.length ? (
            <div className="flex flex-col gap-0.5 text-sm" data-studio-not-printed>
              <b className="text-xs font-extrabold tracking-wide text-(--muted2) uppercase">{t("notPrintedTitle")}</b>
              {others.map((n) => (
                <span key={n.layerId} className="text-xs">
                  {t("sideOf", {
                    side: sideName(lang, surfaceOfLayer(n.layerId)),
                    what: vt(n.what === "photoSpot" ? "notPrintedPhoto" : n.what === "qrEmpty" ? "notPrintedQr" : "notPrintedHidden"),
                  })}
                </span>
              ))}
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5 border-t border-(--line) pt-2 text-sm" data-studio-findings>
            <b className="text-xs font-extrabold tracking-wide text-(--muted2) uppercase">{vt("autoCheck")}</b>
            {quality.items.filter((it) => it.code !== "sampleNotPrinted").length === 0 ? (
              <span className="font-semibold text-[#1f8a4c]">✓ {vt("autoOk")}</span>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {quality.items
                  .filter((it) => it.code !== "sampleNotPrinted")
                  .map((it) => {
                    const m = studioQualityMessage(it, lang);
                    return (
                      <li key={it.id} className="flex items-start gap-2" data-level={it.level}>
                        <span
                          aria-hidden="true"
                          className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full text-[11px] font-extrabold text-white"
                          style={{ background: it.level === "red" ? "#c0392b" : "#c98a0b" }}
                        >
                          {it.level === "red" ? "×" : "!"}
                        </span>
                        <span className="flex flex-col">
                          <b>{it.surfaceId ? `${sideName(lang, it.surfaceId)}: ${m.title}` : m.title}</b>
                          <span className="text-xs text-(--muted)">{m.fix}</span>
                        </span>
                      </li>
                    );
                  })}
              </ul>
            )}
          </div>
          <label className={`mt-1 flex min-h-12 cursor-pointer items-start gap-3 rounded-xl p-3 text-sm font-bold ${approved ? "bg-[#e8f5ec]" : "bg-[#faf3dc]"}`}>
            <input type="checkbox" data-studio-approve className="mt-0.5 h-6 w-6 flex-none accent-(--ink)" checked={approved} onChange={(e) => setApproved(e.target.checked)} aria-describedby="studio-approve-req" />
            <span className="flex flex-col gap-0.5">
              <span>{st("approve")}</span>
              <span id="studio-approve-req" className={`text-xs font-extrabold text-[#a82e22] ${approved ? "sr-only" : ""}`}>
                {st("required")}
              </span>
            </span>
          </label>
        </section>

        {quality.blocks ? (
          <p role="alert" className="m-0 rounded-xl bg-[#fdecea] px-3 py-2 text-sm font-bold text-[#a82e22]">
            {st("qualityBlocked")}
          </p>
        ) : !approved ? (
          <p className="m-0 text-xs text-(--muted2)">{st("approveNeeded")}</p>
        ) : null}
        {error ? (
          <p role="alert" className="m-0 text-sm font-semibold text-(--err)">
            {error}
          </p>
        ) : null}
        {saving ? <StudioCartProgressLine p={saving} t={st} /> : null}
        <button type="button" data-studio-add disabled={!canAdd} onClick={() => void add()} className="shop-btn-dark min-h-14 rounded-xl bg-(--ink) py-3 text-[17px] font-extrabold text-white disabled:opacity-40">
          {editLine ? st("updateCart") : st("addToCart")}
        </button>
        <button type="button" disabled={saving != null} onClick={onBack} className="min-h-12 rounded-xl border-[1.5px] border-(--line2) font-semibold">
          {st("backToEdit")}
        </button>
      </div>
    </div>
  );
}

/**
 * Flyer options of «Verifică»: format, sides (from the document: a back = two
 * sides; added / removed here), paper weight, pack and lamination — the
 * print-shop flyer product's own lists (`printShop/config.ts`).
 */
function FlyerOptions({
  api,
  short,
  fields,
  onBackAdded,
  wantBack,
  onShort,
  onFormat,
  paper,
  onPaper,
  pack,
  onPack,
  lamination,
  onLamination,
  chip,
  disabled,
}: {
  api: StudioEditorApi;
  short: CardShortState | null;
  onShort?: (s: CardShortState) => void;
  onFormat?: (f: FlyerFormatId) => void;
  paper: number;
  onPaper: (n: number) => void;
  pack: number;
  onPack: (n: number) => void;
  lamination: PsLamination | null;
  onLamination: (l: PsLamination | null) => void;
  chip: (on: boolean) => string;
  disabled: boolean;
  fields: StudioFields;
  /** The back was added here (true) / removed (false). */
  onBackAdded: (added: boolean) => void;
  /** Two sides asked for (a short-edit flyer: its picks, before the document follows). */
  wantBack: boolean;
}) {
  const ft = studioFlyerT(api.lang);
  const p = flyerProduct();
  const format: FlyerFormatId = flyerFormatOfSpecs(api.specs);
  const hasBack: boolean = wantBack;
  const canLaminate: boolean = !!flyerFormat(format).laminationSize && (p.lamination?.finishes.length ?? 0) > 0;
  const setBack = (on: boolean) => {
    if (on === hasBack) return;
    onBackAdded(on);
    if (short && onShort) {
      // The customer does not see this back before it prints: one their details fill completely
      // (the front's own back only when its free texts are theirs), shown with a note.
      onShort(on ? cardShortWithAutoBack(short, api.lang, api.specs) : { ...short, backId: null });
      return;
    }
    if (!on) {
      api.setSurface(CARD_FRONT_ID);
      api.setDoc(removeCardBack(api.doc));
      return;
    }
    // A full-editor flyer: the same pick, filled with «Datele mele» (else a copy of the front's style).
    const tpl: StudioTemplate | null = studioTemplateById(api.doc.templateId ?? null);
    const back: StudioTemplate | null = tpl && tpl.side !== "back" ? sheetAutoBack(tpl, {}, api.lang, api.specs, "flyer") : null;
    const details: StudioFields = mergeStudioFields(fieldsFromDoc(api.doc), fields);
    api.setDoc(fitAllTextBoxes(addCardBack(api.doc, api.specs, back ? { kind: "template", template: back } : { kind: "copy" }, api.lang, details), "bound"));
  };
  return (
    <>
      {onFormat ? (
        <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
          <legend className="mb-2 p-0 text-[15px] font-bold">{ft("format")}</legend>
          <FlyerFormatChips lang={api.lang} value={format} onChange={onFormat} disabled={disabled} />
        </fieldset>
      ) : null}
      <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
        <legend className="mb-2 p-0 text-[15px] font-bold">{ft("sidesTitle")}</legend>
        <div className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={!hasBack} disabled={disabled} data-studio-flyer-sides="one" className={chip(!hasBack)} onClick={() => setBack(false)}>
            {ft("sidesOneLong")}
          </button>
          <button type="button" aria-pressed={hasBack} disabled={disabled} data-studio-flyer-sides="two" className={chip(hasBack)} onClick={() => setBack(true)}>
            {ft("sidesTwoLong")}
          </button>
        </div>
      </fieldset>
      <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
        <legend className="mb-2 p-0 text-[15px] font-bold">{ft("paper")}</legend>
        <div className="flex flex-wrap gap-2">
          {p.papers.map((n) => (
            <button key={n} type="button" aria-pressed={paper === n} data-studio-flyer-paper={n} className={chip(paper === n)} onClick={() => onPaper(n)}>
              {ft("paperOption", { n })}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
        <legend className="mb-2 p-0 text-[15px] font-bold">{ft("pack")}</legend>
        <div className="flex flex-wrap gap-2">
          {p.packs.map((n) => (
            <button key={n} type="button" aria-pressed={pack === n} data-studio-flyer-pack={n} className={chip(pack === n)} onClick={() => onPack(n)}>
              {ft("packOption", { n })}
            </button>
          ))}
        </div>
      </fieldset>
      {canLaminate ? (
        <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
          <legend className="mb-2 p-0 text-[15px] font-bold">{ft("lamination")}</legend>
          <div className="flex flex-wrap gap-2">
            {([null, ...(p.lamination?.finishes ?? [])] as (PsLamination | null)[]).map((v) => (
              <button key={v ?? "none"} type="button" aria-pressed={lamination === v} data-studio-flyer-lamination={v ?? "none"} className={chip(lamination === v)} onClick={() => onLamination(v)}>
                {ft(v === "gloss" ? "laminationGloss" : v === "matte" ? "laminationMatte" : "laminationNone")}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}
    </>
  );
}
