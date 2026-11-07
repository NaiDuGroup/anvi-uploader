"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatPrice } from "@/lib/storefront/format";
import { cardSideSlots, type CardSlotInfo } from "@/lib/studio/cardBuild";
import { cardShortSetBack, cardShortSetText, cardShortWithBack, sheetFieldsNotShown, type CardShortState } from "@/lib/studio/cardFlow";
import { cardShortDocMeasured } from "@/lib/studio/cardFlowClient";
import { cardHasBack } from "@/lib/studio/cardLine";
import { docFitsSpec, sheetSizeKey, sheetSpecsKey, type FlyerFormatId } from "@/lib/studio/flyer";
import { renderPreviewCanvas } from "@/lib/studio/exportClient";
import { onStudioFontsLoaded } from "@/lib/studio/fonts";
import { studioCardT } from "@/lib/studio/i18n.card";
import { studioFlyerT, studioSheetT } from "@/lib/studio/i18n.flyer";
import { studioShopT } from "@/lib/studio/i18n.shop";
import type { StudioFields } from "@/lib/studio/smartFields";
import { CARD_BACK_ID, CARD_FRONT_ID, type SheetStudioKind, type StudioSurfaceSpec } from "@/lib/studio/surfaces";
import { studioBackTemplates, studioTemplateById, type StudioTemplate } from "@/lib/studio/templates";
import type { StudioEditorApi } from "./StudioApp";
import {
  CARD_AUTOCOMPLETE,
  CARD_FIELD_LABEL,
  CARD_INPUT_MODE,
  CARD_INPUT_TYPE,
  CardColorsRow,
  CardLogoButton,
  CardPhotoSlot,
  FLYER_FIELD_LABEL,
  SheetFieldsNotShownNote,
  isCardTextField,
  isFlyerTextField,
  useCardFieldSetter,
  useLogoPalette,
} from "./StudioCardFields";
import { CardSidePicture } from "./StudioCardGallery";
import { FlyerFormatChips, SheetRecalculating, flyerFormatOfSpecs, useSheetSidePrices } from "./StudioFlyer";
import { useStableAssets, useStudioProductLook } from "./StudioProductPicture";
import { Icon, STUDIO_ICONS, inputCls } from "./StudioUi";

/**
 * «Editare rapidă» of a business card or a flyer (after a gallery pick): the texts of
 * the side in a form, the card beside it with the cut line and the safe
 * zone, «Față / Verso», colours, «Doar față / Față + verso» with the price,
 * another back. The document is re-drawn from the picks and «Datele mele» on
 * every change (same id: autosave, verify and the cart keep working).
 * «Editare avansată» hands the card to the full editor for good. Flyers
 * (`flyer`) add the format switch (the document is re-drawn at the new size)
 * and their texts' labels; the back's price is the live two-sided total
 * minus the one-sided one.
 */

/** The side with the template's sample texts still shown (as the gallery has it; they are not printed), edge of the file shaded, the red cut line and the dotted blue safe zone over it. */
function ShortPreview({ api, spec, label, pending = false }: { api: StudioEditorApi; spec: StudioSurfaceSpec; label: string; pending?: boolean }) {
  // The picture and the size it was drawn at: a picture of another format is never shown stretched into this one.
  const [drawn, setDrawn] = useState<{ url: string; size: string } | null>(null);
  const { doc, renderAssets, version } = api;
  const size: string = sheetSizeKey(spec);
  // The document not re-laid out for this format yet (the old layout only fitted to the new size): not drawn.
  const waiting: boolean = pending || !docFitsSpec(doc, spec);
  useEffect(() => {
    if (waiting) return;
    const id = window.requestAnimationFrame(() => {
      const c = renderPreviewCanvas(doc, spec, renderAssets, 1100, null, false);
      setDrawn({ url: c.toDataURL("image/png"), size: sheetSizeKey(spec) });
    });
    return () => window.cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- redraw on version (doc, photos, fonts)
  }, [version, spec, waiting]);
  const url: string | null = drawn && drawn.size === size && !waiting ? drawn.url : null;
  const bx: number = (spec.bleedMm / spec.widthMm) * 100;
  const by: number = (spec.bleedMm / spec.heightMm) * 100;
  const sx: number = (spec.safeMm / spec.widthMm) * 100;
  const sy: number = (spec.safeMm / spec.heightMm) * 100;
  return (
    <div
      className="relative w-full overflow-hidden rounded-md bg-white shadow-[0_10px_30px_rgba(20,33,61,0.18)]"
      style={{ aspectRatio: `${spec.widthMm} / ${spec.heightMm}` }}
      data-studio-card-short-preview={spec.id}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- generated data URL
        <img src={url} alt={label} className="h-full w-full" />
      ) : null}
      {waiting ? <SheetRecalculating lang={api.lang} /> : null}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute border-[1.5px] border-[#e11d48]"
        style={{ left: `${bx}%`, right: `${bx}%`, top: `${by}%`, bottom: `${by}%`, boxShadow: "0 0 0 999px rgba(255,255,255,0.5)" }}
      />
      <span aria-hidden="true" className="pointer-events-none absolute border border-dashed border-[#2563eb]" style={{ left: `${sx}%`, right: `${sx}%`, top: `${sy}%`, bottom: `${sy}%` }} />
    </div>
  );
}

/** One text slot of the side: a «Datele mele» field or a free text of the template. */
function SlotInput({ api, slot, n, fields, state, set, onState }: { api: StudioEditorApi; slot: CardSlotInfo; n: number; fields: StudioFields; state: CardShortState; set: ReturnType<typeof useCardFieldSetter>; onState: (s: CardShortState) => void }) {
  const ts = studioShopT(api.lang);
  const t = studioCardT(api.lang);
  const sample: string = slot.sample.replace(/\n/g, " ");
  if (api.kind === "flyer" && slot.kind === "field" && isFlyerTextField(slot.id)) {
    // Flyer texts: the body and the list are written on several lines.
    const k = slot.id;
    const ft = studioFlyerT(api.lang);
    const long: boolean = k === "body" || k === "bullets";
    const common = {
      "data-studio-card-short-field": k,
      value: ((fields as Record<string, unknown>)[k] as string | undefined) ?? "",
      placeholder: long ? slot.sample : sample,
      maxLength: long ? 400 : 120,
    };
    return (
      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold text-(--muted)">{ft(FLYER_FIELD_LABEL[k])}</span>
        {long ? (
          <textarea {...common} rows={k === "bullets" ? 4 : 3} onChange={(e) => set({ [k]: e.target.value })} className={`${inputCls} h-auto py-2`} />
        ) : (
          <input type="text" {...common} onChange={(e) => set({ [k]: e.target.value })} className={inputCls} />
        )}
        {k === "bullets" ? <span className="text-[11px] text-(--muted)">{ft("fBulletsHint")}</span> : null}
      </label>
    );
  }
  if (slot.kind === "field") {
    const k = slot.id;
    const label: string = isCardTextField(k) ? ts(CARD_FIELD_LABEL[k]) : sample;
    return (
      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold text-(--muted)">{label}</span>
        <input
          type={isCardTextField(k) ? (CARD_INPUT_TYPE[k] ?? "text") : "text"}
          inputMode={isCardTextField(k) ? CARD_INPUT_MODE[k] : undefined}
          autoComplete={isCardTextField(k) ? CARD_AUTOCOMPLETE[k] : undefined}
          data-studio-card-short-field={k}
          value={(fields as Record<string, unknown>)[k] as string | undefined ?? ""}
          placeholder={sample}
          maxLength={120}
          onChange={(e) => set({ [k]: e.target.value })}
          className={inputCls}
        />
      </label>
    );
  }
  const multi: boolean = slot.sample.includes("\n");
  const common = {
    "data-studio-card-short-text": slot.id,
    value: state.texts[slot.id] ?? "",
    placeholder: sample,
    maxLength: 300,
  };
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-bold text-(--muted)">{slot.label ?? (n > 0 ? `${t("freeText")} ${n}` : t("freeText"))}</span>
      {multi ? (
        <textarea {...common} rows={3} onChange={(e) => onState(cardShortSetText(state, slot.id, e.target.value))} className={`${inputCls} h-auto py-2`} />
      ) : (
        <input type="text" {...common} onChange={(e) => onState(cardShortSetText(state, slot.id, e.target.value))} className={inputCls} />
      )}
    </label>
  );
}

export function StudioCardShort({
  api,
  fields,
  onFields,
  state,
  onState,
  onAdvanced,
  onContinue,
  onGallery,
  onFormat,
  initialSide = "front",
}: {
  api: StudioEditorApi;
  fields: StudioFields;
  onFields: (f: StudioFields) => void;
  state: CardShortState;
  onState: (s: CardShortState) => void;
  onAdvanced: () => void;
  onContinue: () => void;
  onGallery: () => void;
  /** Flyers: another format (the page passes the new print size; the document is re-drawn at it). */
  onFormat?: (f: FlyerFormatId) => void;
  /** The side shown first («Editează versoul» on the verify step opens the back). */
  initialSide?: "front" | "back";
}) {
  const kind: SheetStudioKind = api.kind === "flyer" ? "flyer" : "card";
  const t = studioSheetT(kind, api.lang);
  const set = useCardFieldSetter(fields, onFields);
  const logoPalette = useLogoPalette(api, fields.logo);
  const look = useStudioProductLook(api);
  const assets = useStableAssets(api.renderAssets);
  const [sideWanted, setSide] = useState<"front" | "back">(initialSide);
  // Phones: while a field is being typed in, the card on top gets small (the form keeps most of the screen).
  const [typing, setTyping] = useState(false);
  // …and once the form is scrolled (the card stays in view, smaller).
  const root = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let el: HTMLElement | null = root.current?.parentElement ?? null;
    while (el && !/(auto|scroll)/.test(getComputedStyle(el).overflowY)) el = el.parentElement;
    const target: HTMLElement | Window = el ?? window;
    const on = () => setScrolled((el ? el.scrollTop : window.scrollY) > 24);
    target.addEventListener("scroll", on, { passive: true });
    return () => target.removeEventListener("scroll", on);
  }, []);
  const compact: boolean = typing || scrolled;
  const side: "front" | "back" = state.backId ? sideWanted : "front";
  const lastBack = useRef<string | null>(state.backId);
  useEffect(() => {
    if (state.backId) lastBack.current = state.backId;
  }, [state.backId]);
  const front: StudioTemplate | null = studioTemplateById(state.frontId);
  const back: StudioTemplate | null = state.backId ? studioTemplateById(state.backId) : null;
  const backs: StudioTemplate[] = useMemo(() => studioBackTemplates(kind), [kind]);

  // ─── The document follows the picks and the details (debounced, latest wins) ──
  const docId = useRef(api.doc.id);
  const seq = useRef(0);
  const [fontsEpoch, setFontsEpoch] = useState(0);
  const fieldsKey: string = JSON.stringify(fields);
  const stateKey: string = JSON.stringify(state);
  const { replaceDoc, lang, specs } = api;
  const specsKey: string = sheetSpecsKey(specs);
  // What the document on screen was last drawn from: «Continuă» waits for the latest picks / texts, and
  // another format shows no preview (nor lets the customer go on) until the document is laid out for it.
  const inputKey = `${stateKey}|${fieldsKey}|${lang}|${specsKey}`;
  const [built, setBuilt] = useState<{ input: string; specs: string }>({ input: inputKey, specs: specsKey });
  const busy: boolean = built.input !== inputKey;
  const relayout: boolean = built.specs !== specsKey;
  const wantContinue = useRef(false);
  const onContinueRef = useRef(onContinue);
  useEffect(() => {
    onContinueRef.current = onContinue;
  });
  useEffect(() => {
    const n = ++seq.current;
    let off: (() => void) | null = null;
    const forInput: string = inputKey;
    const forSpecs: string = specsKey;
    const timer = window.setTimeout(() => {
      void cardShortDocMeasured(state, { fields, lang, specs, id: docId.current }).then((r) => {
        if (n !== seq.current) return;
        setBuilt({ input: forInput, specs: forSpecs });
        if (!r) return;
        replaceDoc(r.doc);
        if (wantContinue.current) {
          // «Continuă» pressed while this was being drawn: go on with this document.
          wantContinue.current = false;
          onContinueRef.current();
          return;
        }
        if (!r.fontsReady && fontsEpoch < 4) {
          // Re-measure once the fonts are in (also when they landed before this listener).
          const again = () => n === seq.current && setFontsEpoch((x) => x + 1);
          off = onStudioFontsLoaded(again);
          void document.fonts?.ready.then(() => window.setTimeout(again, 50));
        }
      });
    }, 150);
    return () => {
      window.clearTimeout(timer);
      off?.();
    };
    // The keys stand for `state` / `fields` (their objects change identity more often).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateKey, fieldsKey, lang, specs, fontsEpoch]);

  const slots: CardSlotInfo[] = useMemo(() => {
    const tpl: StudioTemplate | null = side === "back" ? back : front;
    return tpl ? cardSideSlots(tpl, side, api.lang, api.specs, kind) : [];
  }, [side, front, back, api.lang, api.specs, kind]);

  const format: FlyerFormatId = flyerFormatOfSpecs(api.specs);
  const prices = useSheetSidePrices(kind, api.lang, format);
  const { one, two } = prices;
  const pack: number = prices.pack;
  const hasBack: boolean = state.backId != null;
  const total: number | null = hasBack ? two : one;
  // A free text of this side still shows its sample (drawn, not printed).
  const untouched: boolean = slots.some((s) => s.kind === "text" && !(state.texts[s.id] ?? "").trim());
  const spec: StudioSurfaceSpec | undefined = api.specs.find((s) => s.id === (side === "back" ? CARD_BACK_ID : CARD_FRONT_ID));
  const docReady: boolean = side === "front" || cardHasBack(api.doc);
  const sideLabel: string = t(side === "back" ? "back" : "front");
  const extra: string = prices.extra ?? "…";
  const notShown = useMemo(() => sheetFieldsNotShown(api.doc, fields, kind), [api.doc, fields, kind]);
  const go = () => {
    if (relayout) return;
    if (busy) wantContinue.current = true;
    else onContinue();
  };

  const toggleBack = (on: boolean) => {
    onState(cardShortWithBack(state, on, lastBack.current));
    setSide(on ? "back" : "front");
  };
  const tab = (on: boolean) => `flex min-h-11 items-center gap-1.5 rounded-[9px] px-4 text-sm font-bold whitespace-nowrap ${on ? "bg-(--ink) text-white" : "text-(--ink)"}`;
  const sideChoice = (on: boolean) =>
    `flex min-h-12 flex-1 flex-col items-start justify-center rounded-xl border-[1.5px] px-3 py-1.5 text-left text-sm font-bold ${on ? "border-(--ink) bg-(--ink) text-white" : "border-(--line2) bg-white text-(--ink) hover:border-(--ink)"}`;

  return (
    <div ref={root} className="mx-auto flex w-full max-w-[1280px] flex-col" data-studio-card-short>
      <div className="grid items-start gap-5 px-4 pt-4 pb-4 md:px-6 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)] lg:gap-8 lg:pt-6">
        {/* The card: on top on phones (stays in view while typing), right on wide screens. */}
        <section aria-label={t("preview", { side: sideLabel })} className="sticky top-0 z-10 -mx-4 flex flex-col gap-2 bg-white px-4 pt-1 pb-3 lg:order-2 lg:top-4 lg:mx-0 lg:px-0 lg:pt-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div role="group" aria-label={t("sides")} data-studio-card-sides className="flex items-center gap-1 rounded-[11px] border border-(--line) bg-white p-1">
              <button type="button" aria-pressed={side === "front"} data-studio-side="front" className={tab(side === "front")} onClick={() => setSide("front")}>
                {t("front")}
              </button>
              {hasBack ? (
                <button type="button" aria-pressed={side === "back"} data-studio-side="back" className={tab(side === "back")} onClick={() => setSide("back")}>
                  {t("back")}
                </button>
              ) : (
                <button type="button" data-studio-add-back className={`${tab(false)} border border-dashed border-(--line2)`} onClick={() => toggleBack(true)}>
                  <span className="hidden sm:inline">{t("addBackFull", { price: extra })}</span>
                  <span className="sm:hidden">+ {t("addBack")}</span>
                </button>
              )}
            </div>
            <button type="button" data-studio-card-other-model onClick={onGallery} className="hidden min-h-11 rounded-xl px-2 text-sm font-bold whitespace-nowrap underline underline-offset-2 sm:block">
              {t("backToGallery")}
            </button>
          </div>
          <div className={`mx-auto w-full py-1 transition-[max-width] duration-200 lg:max-w-[640px] lg:py-4 ${kind === "flyer" ? (compact ? "max-w-[110px] lg:max-w-[440px]" : "max-w-[200px] md:max-w-[320px] lg:max-w-[440px]") : compact ? "max-w-[180px]" : "max-w-[280px] md:max-w-[420px]"}`} data-studio-card-short-compact={compact || undefined}>{spec && docReady ? <ShortPreview api={api} spec={spec} label={t("preview", { side: sideLabel })} pending={relayout} /> : <div className="w-full rounded-md bg-(--soft)" style={{ aspectRatio: spec ? `${spec.widthMm} / ${spec.heightMm}` : "94 / 54" }} />}</div>
          <p className={`m-0 text-center text-[11px] text-(--muted2) ${compact ? "hidden lg:block" : ""}`}>{t("guides")}</p>
          {untouched ? <p className={`m-0 text-center text-[11px] text-(--muted2) ${compact ? "hidden lg:block" : ""}`} data-studio-card-samples-note>{t("samplesNote")}</p> : null}
        </section>

        <div
          className="flex min-w-0 flex-col gap-4 lg:order-1"
          onFocusCapture={(e) => {
            const el = e.target as HTMLElement;
            if (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && (el as HTMLInputElement).type !== "color" && (el as HTMLInputElement).type !== "file")) setTyping(true);
          }}
          onBlurCapture={(e) => {
            // Moving to the next field keeps it small (no jump between fields).
            const next = e.relatedTarget as HTMLElement | null;
            if (!next || !e.currentTarget.contains(next) || (next.tagName !== "INPUT" && next.tagName !== "TEXTAREA")) setTyping(false);
          }}
        >
          <div className="flex flex-col gap-1">
            <h1 className="m-0 text-xl leading-tight font-extrabold lg:text-2xl">{t("shortTitle")}</h1>
            <p className="m-0 text-sm text-(--muted)">{t("shortLead")}</p>
          </div>
          <section aria-labelledby="studio-card-short-texts" className="flex flex-col gap-2.5 rounded-2xl border-[1.5px] border-(--line) p-3 md:p-4">
            <h2 id="studio-card-short-texts" className="m-0 text-[15px] font-extrabold">
              {t("sideTexts", { side: sideLabel.toLowerCase() })}
            </h2>
            {slots.length === 0 ? <p className="m-0 text-sm text-(--muted)">{t("noTexts")}</p> : null}
            <SheetFieldsNotShownNote lang={api.lang} kind={kind} keys={notShown} hint={hasBack ? "other" : "otherOrBack"} />
            {slots.map((s) => {
              if (s.kind === "photo") return <CardPhotoSlot key={s.key} api={api} photo={state.photo} onPhoto={(photo) => onState({ ...state, photo })} />;
              const free: CardSlotInfo[] = slots.filter((x) => x.kind === "text");
              const n: number = free.length > 1 ? free.indexOf(s) + 1 : 0;
              return <SlotInput key={s.key} api={api} slot={s} n={n} fields={fields} state={state} set={set} onState={onState} />;
            })}
          </section>

          {kind === "flyer" && onFormat ? (
            <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0" data-studio-flyer-short-format>
              <legend className="mb-2 p-0 text-[15px] font-bold">{studioFlyerT(api.lang)("formatTitle")}</legend>
              <FlyerFormatChips lang={api.lang} value={format} onChange={onFormat} />
            </fieldset>
          ) : null}

          <section className="flex flex-col gap-3 rounded-2xl bg-[#faf3dc] p-3 md:p-4" aria-label={t("colors")}>
            <CardLogoButton api={api} fields={fields} set={set} />
            <CardColorsRow api={api} fields={fields} set={set} logoPalette={logoPalette} presets />
          </section>

          <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
            <legend className="mb-2 p-0 text-[15px] font-bold">{t("sides")}</legend>
            <div className="flex gap-2">
              <button type="button" aria-pressed={!hasBack} data-studio-card-sides-one className={sideChoice(!hasBack)} onClick={() => toggleBack(false)}>
                {t("sidesOne")}
                <span className="text-xs font-semibold opacity-80">{one != null ? t("packPrice", { price: formatPrice(one, api.lang), n: pack }) : "…"}</span>
              </button>
              <button type="button" aria-pressed={hasBack} data-studio-card-sides-two className={sideChoice(hasBack)} onClick={() => toggleBack(true)}>
                {t("sidesTwo")}
                <span className="text-xs font-semibold opacity-80">{two != null ? t("packPrice", { price: formatPrice(two, api.lang), n: pack }) : t("addBackPrice", { price: extra })}</span>
              </button>
            </div>
          </fieldset>

          {hasBack && front ? (
            <section aria-labelledby="studio-card-other-back" className="flex flex-col gap-2">
              <h2 id="studio-card-other-back" className="m-0 text-[15px] font-bold">
                {t("otherBack")}
              </h2>
              <ul className="m-0 grid list-none grid-cols-4 gap-2 p-0">
                {backs.map((b) => (
                  <li key={b.id} className="min-w-0">
                    <button
                      type="button"
                      aria-pressed={state.backId === b.id}
                      aria-label={b.name[api.lang]}
                      title={b.name[api.lang]}
                      data-studio-back-option={b.id}
                      onClick={() => {
                        onState(cardShortSetBack(state, b.id));
                        setSide("back");
                      }}
                      className={`block w-full rounded-lg border-2 p-0.5 ${state.backId === b.id ? "border-(--ink)" : "border-transparent hover:border-(--line2)"}`}
                    >
                      <CardSidePicture tpl={front} back={b} side="back" fields={fields} api={api} assets={assets} look={look} visible className="w-full rounded-[3px] ring-1 ring-black/10" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>

      {/* Actions: at the bottom of the screen on phones, under the content on wide screens. */}
      <div className="sticky bottom-0 z-20 flex items-center gap-2 border-t border-(--line) bg-white px-4 py-2.5 md:px-6" data-studio-card-short-bar>
        <button
          type="button"
          data-studio-card-advanced
          onClick={onAdvanced}
          title={`${t("advanced")} — ${t("advancedSub")}`}
          aria-label={api.isPhone ? t("advanced") : undefined}
          className="flex min-h-12 min-w-12 items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-(--line2) px-3 text-sm font-bold whitespace-nowrap"
        >
          <Icon d={STUDIO_ICONS.edit} size={16} />
          {api.isPhone ? null : t("advanced")}
        </button>
        {/* Phones: «Alt model» lives here (the row above the card has no room for it). */}
        <button
          type="button"
          data-studio-card-other-model-phone
          onClick={onGallery}
          aria-label={t("backToGallery")}
          title={t("backToGallery")}
          className="flex min-h-12 min-w-12 items-center justify-center rounded-xl border-[1.5px] border-(--line2) px-3 sm:hidden"
        >
          <Icon d={STUDIO_ICONS.templates} size={18} />
        </button>
        <span className="ml-auto text-right text-sm leading-tight">
          <b className="block text-base" data-studio-card-short-total aria-live="polite">
            {total != null ? formatPrice(total, api.lang) : "…"}
          </b>
          <span className="text-xs text-(--muted)">{t("pcs", { n: pack })}</span>
        </span>
        <button
          type="button"
          data-studio-card-short-continue
          onClick={go}
          disabled={relayout}
          aria-busy={relayout || undefined}
          className="shop-btn-dark flex min-h-12 items-center rounded-xl bg-(--ink) px-5 text-[15px] font-extrabold whitespace-nowrap text-white disabled:opacity-40"
        >
          {t("continue")} →
        </button>
      </div>
    </div>
  );
}

