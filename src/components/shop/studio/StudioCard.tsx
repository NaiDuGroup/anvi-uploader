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
import { STUDIO_PHOTO_MAX_BYTES, STUDIO_PHOTO_TYPES } from "@/lib/studio/assets";
import { addCardBack, cardDesignCartLine, cardHasBack, cardQuoteLine, removeCardBack, type CardBackStart, type CardSideFile } from "@/lib/studio/cardLine";
import { emptyStudioDoc, type StudioDoc } from "@/lib/studio/document";
import { exportStudioPng, renderPreviewCanvas, studioThumbnail } from "@/lib/studio/exportClient";
import { saveStudioFieldsLocal } from "@/lib/studio/fieldsStore";
import { fitAllTextBoxes } from "@/lib/studio/fonts";
import { studioCardT } from "@/lib/studio/i18n.card";
import { studioShopT, type StudioShopKey } from "@/lib/studio/i18n.shop";
import { studioViewsT } from "@/lib/studio/i18n.views";
import { toLegacyLayout } from "@/lib/studio/legacy";
import { studioQualityMessage } from "@/lib/studio/quality";
import { applyStudioFields, cleanFields, type StudioFields } from "@/lib/studio/smartFields";
import { saveDoc } from "@/lib/studio/storage";
import { CARD_BACK_ID, CARD_FRONT_ID, initialSurfaceBases, type StudioSurfaceSpec } from "@/lib/studio/surfaces";
import { studioCardBackTemplates, type StudioTemplate } from "@/lib/studio/templates";
import { studioApprovalChecks, studioVerifyNotes } from "@/lib/studio/verifyChecklist";
import { useShopLang } from "../ShopLangProvider";
import type { StudioEditorApi } from "./StudioApp";
import { StudioLivePicture, productThumbnail, useStableAssets, useStudioProductLook } from "./StudioProductPicture";
import type { StudioQualityState } from "./StudioQuality";
import { TemplateGrid, studioDocFromTemplate } from "./StudioStart";
import { Icon, STUDIO_ICONS, inputCls } from "./StudioUi";
import { StudioCartProgressLine, StudioPhotosMissing, uploadStudioPhotos } from "./StudioVerify";
import type { StudioCartProgress } from "@/lib/studio/cartProgress";

/**
 * ANVI Studio for business cards (`card`, staff / tester only — `flag.ts`):
 * the «Față / Verso» switch with «Adaugă verso», the start screen (details
 * once + templates) and «Verifică» with the pack, finishing, the empty-field
 * list and the approval. The cart line is the ordinary business-card pack
 * with one 300 dpi PNG per side (`cardLine.ts`).
 */

const sideName = (lang: StudioEditorApi["lang"], id: string) => studioCardT(lang)(id === CARD_BACK_ID ? "back" : "front");

// ─── «Față / Verso» ─────────────────────────────────────────────────────

export function StudioCardSideBar({ api, fields }: { api: StudioEditorApi; fields: StudioFields }) {
  const t = studioCardT(api.lang);
  const [chooser, setChooser] = useState(false);
  const hasBack: boolean = cardHasBack(api.doc);
  const onBack: boolean = api.spec.id === CARD_BACK_ID;
  const extra: string = formatPrice(SHOP_BC_BACK_PER_CARD_MDL, api.lang);
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
function CardBackChooser({ api, fields, onClose, onPick }: { api: StudioEditorApi; fields: StudioFields; onClose: () => void; onPick: (s: CardBackStart) => void }) {
  const t = studioCardT(api.lang);
  const backSpec: StudioSurfaceSpec | undefined = api.specs.find((s) => s.id === CARD_BACK_ID);
  const look = useStudioProductLook(api);
  const assets = useStableAssets(api.renderAssets);
  const templates: StudioTemplate[] = useMemo(() => studioCardBackTemplates(), []);
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
            <p className="m-0 text-sm text-(--muted)">{t("backLead", { price: formatPrice(SHOP_BC_BACK_PER_CARD_MDL, api.lang) })}</p>
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

// ─── Start: details once, then a template ───────────────────────────────

const FIELD_LABEL: Record<"name" | "title" | "company" | "phone" | "email" | "site" | "address", StudioShopKey> = {
  name: "fName",
  title: "fTitle",
  company: "fCompany",
  phone: "fPhone",
  email: "fEmail",
  site: "fSite",
  address: "fAddress",
};
const INPUT_TYPE: Partial<Record<keyof typeof FIELD_LABEL, string>> = { phone: "tel", email: "email", site: "url" };

export function StudioCardStart({
  api,
  fields,
  onFields,
  onStart,
}: {
  api: StudioEditorApi;
  fields: StudioFields;
  onFields: (f: StudioFields) => void;
  onStart: (doc: StudioDoc) => void;
}) {
  const t = studioCardT(api.lang);
  const ts = studioShopT(api.lang);
  const logoInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  // Thumbnails redraw once typing pauses.
  const [shown, setShown] = useState<StudioFields>(fields);
  useEffect(() => {
    const id = window.setTimeout(() => setShown(fields), 350);
    return () => window.clearTimeout(id);
  }, [fields]);
  const set = (patch: StudioFields) => {
    const next: StudioFields = { ...fields, ...patch };
    onFields(next);
    saveStudioFieldsLocal(cleanFields(next));
  };
  const pick = async (tpl: StudioTemplate) => {
    const { doc } = await studioDocFromTemplate(tpl, "card", api.specs, api.lang, fields);
    onStart(fitAllTextBoxes(doc, "all"));
  };
  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5 px-4 py-5 md:px-6" data-studio-card-start>
      <div className="flex flex-col gap-1">
        <span className="self-start rounded-full bg-[#faf3dc] px-2.5 py-0.5 text-[11px] font-extrabold text-[#7a6512]">{t("testBadge")}</span>
        <h1 className="m-0 text-2xl leading-tight font-extrabold md:text-3xl">{t("startTitle")}</h1>
        <p className="m-0 text-sm text-(--muted)">{t("startLead")}</p>
      </div>
      <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        <section aria-labelledby="studio-card-fields" className="flex flex-col gap-2.5 rounded-2xl bg-[#faf3dc] p-3 md:p-4">
          <h2 id="studio-card-fields" className="m-0 text-lg font-extrabold">
            {t("fieldsTitle")}
          </h2>
          {(Object.keys(FIELD_LABEL) as (keyof typeof FIELD_LABEL)[]).map((k) => (
            <label key={k} className="flex flex-col gap-1">
              <span className="text-xs font-bold text-[#5c4c10]">{ts(FIELD_LABEL[k])}</span>
              <input
                type={INPUT_TYPE[k] ?? "text"}
                data-studio-card-field={k}
                value={fields[k] ?? ""}
                maxLength={120}
                onChange={(e) => set({ [k]: e.target.value })}
                className={inputCls}
              />
            </label>
          ))}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-bold text-[#5c4c10]">{t("logo")}</span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-studio-card-logo
                onClick={() => logoInput.current?.click()}
                className="shop-btn-dark flex min-h-11 items-center gap-2 rounded-xl bg-(--ink) px-4 text-sm font-extrabold text-white"
              >
                <Icon d={STUDIO_ICONS.images} size={18} />
                {fields.logo ? t("logoChange") : t("logoAdd")}
              </button>
              {fields.logo ? (
                <button type="button" onClick={() => set({ logo: null })} className="min-h-11 rounded-xl border-[1.5px] border-(--line2) bg-white px-3 text-sm font-bold">
                  {t("logoRemove")}
                </button>
              ) : null}
            </div>
            {error ? (
              <span role="alert" className="text-xs font-bold text-[#a82e22]">
                {error}
              </span>
            ) : null}
            <input
              ref={logoInput}
              type="file"
              accept={STUDIO_PHOTO_TYPES.join(",")}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              data-studio-card-logo-input
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                setError(null);
                if (!(STUDIO_PHOTO_TYPES as readonly string[]).includes(f.type) || f.size > STUDIO_PHOTO_MAX_BYTES) {
                  setError(api.t("uploadFailed"));
                  return;
                }
                try {
                  const a = await api.assets.addFile(f);
                  set({ logo: { localId: a.localId, naturalW: a.naturalW, naturalH: a.naturalH, mime: a.mime } });
                } catch {
                  setError(api.t("uploadFailed"));
                }
              }}
            />
          </div>
        </section>
        <section className="flex min-w-0 flex-col gap-3">
          <h2 className="m-0 text-lg font-extrabold">{t("templatesTitle")}</h2>
          <TemplateGrid api={api} fields={shown} filter={{}} columns="grid-cols-1 sm:grid-cols-2" onPick={(tpl) => void pick(tpl)} />
          <button
            type="button"
            data-studio-card-blank
            onClick={() => onStart(emptyStudioDoc("card", initialSurfaceBases(api.specs)))}
            className="flex min-h-[64px] w-full items-center gap-3 rounded-2xl border-[1.5px] border-(--line) bg-white p-3 text-left hover:border-(--ink)"
          >
            <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-(--soft)">
              <Icon d={STUDIO_ICONS.text} size={22} />
            </span>
            <span className="flex min-w-0 flex-col">
              <b className="text-[15px]">{t("blank")}</b>
              <span className="text-xs text-(--muted)">{t("blankSub")}</span>
            </span>
          </button>
        </section>
      </div>
    </div>
  );
}

/** «Datele mele» applied to the card the customer starts from (fields typed on the start screen). */
export function cardWithFields(doc: StudioDoc, fields: StudioFields): StudioDoc {
  return fitAllTextBoxes(applyStudioFields(doc, fields), "bound");
}

// ─── Verify ─────────────────────────────────────────────────────────────

/** One side as printed (no samples, no guides), the cut line drawn over it. */
function CardSidePreview({ api, spec, label }: { api: StudioEditorApi; spec: StudioSurfaceSpec; label: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const { doc, renderAssets, version } = api;
  useEffect(() => {
    const c = renderPreviewCanvas(doc, spec, renderAssets, 1100, null, true);
    setUrl(c.toDataURL("image/png"));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- redraw on version (doc, photos, fonts)
  }, [version, spec]);
  const bx: number = (spec.bleedMm / spec.widthMm) * 100;
  const by: number = (spec.bleedMm / spec.heightMm) * 100;
  return (
    <figure className="m-0 flex flex-col gap-1.5" data-studio-card-preview={spec.id}>
      <figcaption className="text-sm font-extrabold">{label}</figcaption>
      <div className="relative w-full overflow-hidden rounded-lg border border-(--line) bg-white" style={{ aspectRatio: `${spec.widthMm} / ${spec.heightMm}` }}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- generated data URL
          <img src={url} alt={label} className="h-full w-full" />
        ) : null}
        {/* Outside the cut: shaded; the red line is the cut. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute border-[1.5px] border-[#e11d48]"
          style={{ left: `${bx}%`, right: `${bx}%`, top: `${by}%`, bottom: `${by}%`, boxShadow: "0 0 0 999px rgba(255,255,255,0.45)" }}
        />
      </div>
    </figure>
  );
}

export function StudioCardVerify({
  api,
  quality,
  editLine,
  onBack,
  onAdded,
}: {
  api: StudioEditorApi;
  quality: StudioQualityState;
  editLine: CartLine | null;
  onBack: () => void;
  onAdded: (doc: StudioDoc) => void;
}) {
  const { t: shopT, lang } = useShopLang();
  const t = studioCardT(lang);
  const st = studioShopT(lang);
  const vt = studioViewsT(lang);
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
  const quoteLine: ShopQuoteLine = useMemo(() => cardQuoteLine(api.doc, { pack, lamination, corners }), [api.doc, pack, lamination, corners]);
  const quote = useLiveQuote(quoteLine, lang);
  const ok = quote.status === "done" && quote.line.ok ? quote.line : quote.status === "loading" && quote.previous?.ok ? quote.previous : null;
  const total: number | null = ok ? ok.total : null;
  const unit: number | null = ok ? ok.unitPrice : null;
  const failed: boolean = quote.status === "done" && !quote.line.ok;
  const notes = useMemo(() => studioVerifyNotes(api.doc), [api.doc]);
  const empties = notes.notPrinted.filter((n) => n.what === "sampleText");
  const others = notes.notPrinted.filter((n) => n.what !== "sampleText");
  const sideSpecs: StudioSurfaceSpec[] = api.specs.filter((s) => api.doc.surfaces.some((d) => d.id === s.id));
  const surfaceOfLayer = (id: string): string => api.doc.surfaces.find((s) => s.layers.some((l) => l.id === id))?.id ?? CARD_FRONT_ID;
  const canAdd: boolean = approved && !quality.blocks && saving == null && !failed;
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
      // One 300 dpi PNG per printed side (94×54 mm = 1110×638 px), the front's thumbnails.
      const pngs: { id: string; blob: Blob; thumb: string | null }[] = [];
      let cartThumb: string | null = null;
      let preview: string | null = null;
      try {
        for (const spec of sideSpecs) {
          const { blob, canvas } = await exportStudioPng(doc, spec, ex.assets);
          if (spec.id === CARD_FRONT_ID) {
            cartThumb = productThumbnail(canvas, spec, look, doc) ?? studioThumbnail(canvas, 320);
            preview = studioThumbnail(canvas, 240);
          }
          pngs.push({ id: spec.id, blob, thumb: studioThumbnail(canvas, 480) });
          canvas.width = 0;
          canvas.height = 0;
        }
      } finally {
        ex.release();
      }
      const files: Record<string, CardSideFile> = {};
      for (const [i, p] of pngs.entries()) {
        setSaving({ stage: "upload", pct: null });
        const ref = await uploadArtwork(blobToFile(p.blob, `card-${p.id}-${Date.now()}.png`), (pct) =>
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
      await saveDoc({ id: doc.id, kind: "card", doc, preview: cartThumb, slug: api.product.slug, variantId: null, cartedAt: Date.parse(studio.approvedAt) });
      const text = describeQuoteLine(quoteLine, labels, shopT);
      const line: CartLine = cardDesignCartLine({
        id: editLine?.id ?? newLineId(),
        addedAt: editLine?.addedAt ?? Date.now(),
        quote: quoteLine,
        front: files[CARD_FRONT_ID]!,
        back: files[CARD_BACK_ID] ?? null,
        layout: toLegacyLayout(doc),
        preview: cartThumb,
        studio,
        title: text?.title ?? api.product.name,
        optionsText: text?.optionsText ?? "",
        lastTotal: total,
        fallbackImage: SHOP_BC_IMAGE,
      });
      if (!dispatchCart(editLine ? { type: "update", line } : { type: "add", line })) {
        setSaving(null);
        return;
      }
      api.replaceDoc(doc);
      setSaving(null);
      onAdded(doc);
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
        {sideSpecs.map((spec) => (
          <CardSidePreview key={spec.id} api={api} spec={spec} label={sideName(lang, spec.id)} />
        ))}
        <p className="m-0 text-xs text-(--muted2)">{t("cutNote")}</p>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <b className="text-lg">{api.product.name}</b>
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
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
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
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
