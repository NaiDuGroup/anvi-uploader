"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SHOP_BC_BACK_PER_CARD_MDL, SHOP_BC_DEFAULT_PACK } from "@/lib/storefront/businessCards";
import { formatPrice } from "@/lib/storefront/format";
import { useLiveQuote, type LiveQuoteState } from "@/lib/storefront/quoteClient";
import type { ShopQuoteLine } from "@/lib/storefront/types";
import { STUDIO_PHOTO_MAX_BYTES, STUDIO_PHOTO_TYPES } from "@/lib/studio/assets";
import { cardSideSlots, type CardSlotInfo } from "@/lib/studio/cardBuild";
import { cardShortSetBack, cardShortSetText, cardShortWithBack, type CardShortState } from "@/lib/studio/cardFlow";
import { cardShortDocMeasured } from "@/lib/studio/cardFlowClient";
import { cardHasBack, cardQuoteLine } from "@/lib/studio/cardLine";
import type { StudioSurface } from "@/lib/studio/document";
import { renderPreviewCanvas } from "@/lib/studio/exportClient";
import { onStudioFontsLoaded } from "@/lib/studio/fonts";
import { studioCardT } from "@/lib/studio/i18n.card";
import { studioShopT } from "@/lib/studio/i18n.shop";
import type { StudioFields } from "@/lib/studio/smartFields";
import { CARD_BACK_ID, CARD_FRONT_ID, type StudioSurfaceSpec } from "@/lib/studio/surfaces";
import { studioCardBackTemplates, studioTemplateById, type StudioTemplate } from "@/lib/studio/templates";
import type { StudioEditorApi } from "./StudioApp";
import { CARD_AUTOCOMPLETE, CARD_FIELD_LABEL, CARD_INPUT_MODE, CARD_INPUT_TYPE, CardColorsRow, CardLogoButton, isCardTextField, useCardFieldSetter, useLogoPalette } from "./StudioCardFields";
import { CardSidePicture } from "./StudioCardGallery";
import { useStableAssets, useStudioProductLook } from "./StudioProductPicture";
import { Icon, STUDIO_ICONS, inputCls } from "./StudioUi";

/**
 * «Editare rapidă» of a business card (after a gallery pick): the texts of
 * the side in a form, the card beside it with the cut line and the safe
 * zone, «Față / Verso», colours, «Doar față / Față + verso» with the price,
 * another back. The document is re-drawn from the picks and «Datele mele» on
 * every change (same id: autosave, verify and the cart keep working).
 * «Editare avansată» hands the card to the full editor for good.
 */

/** Quote of the default pack, done or the previous answer while a new one loads. */
function quoteTotal(q: LiveQuoteState): number | null {
  if (q.status === "done" && q.line.ok) return q.line.total;
  if (q.status === "loading" && q.previous?.ok) return q.previous.total;
  return null;
}

const ONE_SIDED: ShopQuoteLine = cardQuoteLine({ surfaces: [] });
const TWO_SIDED: ShopQuoteLine = cardQuoteLine({ surfaces: [{ id: CARD_BACK_ID } as StudioSurface] });

/** The side with the template's sample texts still shown (as the gallery has it; they are not printed), edge of the file shaded, the red cut line and the dotted blue safe zone over it. */
function ShortPreview({ api, spec, label }: { api: StudioEditorApi; spec: StudioSurfaceSpec; label: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const { doc, renderAssets, version } = api;
  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      const c = renderPreviewCanvas(doc, spec, renderAssets, 1100, null, false);
      setUrl(c.toDataURL("image/png"));
    });
    return () => window.cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- redraw on version (doc, photos, fonts)
  }, [version, spec]);
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

/** Photo of a photo template (one spot, both sides). */
function PhotoSlot({ api, state, onState }: { api: StudioEditorApi; state: CardShortState; onState: (s: CardShortState) => void }) {
  const t = studioCardT(api.lang);
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-bold text-(--muted)">{t("photo")}</span>
      <button
        type="button"
        disabled={busy}
        data-studio-card-short-photo
        onClick={() => input.current?.click()}
        className="flex min-h-11 items-center gap-2 self-start rounded-xl border-[1.5px] border-(--line2) bg-white px-4 text-sm font-bold disabled:opacity-60"
      >
        <Icon d={STUDIO_ICONS.images} size={18} />
        {state.photo ? t("photoChange") : t("photoAdd")}
      </button>
      {error ? (
        <span role="alert" className="text-xs font-bold text-[#a82e22]">
          {error}
        </span>
      ) : null}
      <input
        ref={input}
        type="file"
        accept={STUDIO_PHOTO_TYPES.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setError(null);
          if (!(STUDIO_PHOTO_TYPES as readonly string[]).includes(f.type) || f.size > STUDIO_PHOTO_MAX_BYTES) {
            setError(api.t("uploadFailed"));
            return;
          }
          setBusy(true);
          try {
            const a = await api.assets.addFile(f);
            onState({ ...state, photo: { localId: a.localId, naturalW: a.naturalW, naturalH: a.naturalH, mime: a.mime } });
          } catch {
            setError(api.t("uploadFailed"));
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
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
}: {
  api: StudioEditorApi;
  fields: StudioFields;
  onFields: (f: StudioFields) => void;
  state: CardShortState;
  onState: (s: CardShortState) => void;
  onAdvanced: () => void;
  onContinue: () => void;
  onGallery: () => void;
}) {
  const t = studioCardT(api.lang);
  const set = useCardFieldSetter(fields, onFields);
  const logoPalette = useLogoPalette(api, fields.logo);
  const look = useStudioProductLook(api);
  const assets = useStableAssets(api.renderAssets);
  const [sideWanted, setSide] = useState<"front" | "back">("front");
  // Phones: while a field is being typed in, the card on top gets small (the form keeps most of the screen).
  const [typing, setTyping] = useState(false);
  const side: "front" | "back" = state.backId ? sideWanted : "front";
  const lastBack = useRef<string | null>(state.backId);
  useEffect(() => {
    if (state.backId) lastBack.current = state.backId;
  }, [state.backId]);
  const front: StudioTemplate | null = studioTemplateById(state.frontId);
  const back: StudioTemplate | null = state.backId ? studioTemplateById(state.backId) : null;
  const backs: StudioTemplate[] = useMemo(() => studioCardBackTemplates(), []);

  // ─── The document follows the picks and the details (debounced, latest wins) ──
  const docId = useRef(api.doc.id);
  const seq = useRef(0);
  const [fontsEpoch, setFontsEpoch] = useState(0);
  const fieldsKey: string = JSON.stringify(fields);
  const stateKey: string = JSON.stringify(state);
  const { replaceDoc, lang, specs } = api;
  useEffect(() => {
    const n = ++seq.current;
    let off: (() => void) | null = null;
    const timer = window.setTimeout(() => {
      void cardShortDocMeasured(state, { fields, lang, specs, id: docId.current }).then((r) => {
        if (!r || n !== seq.current) return;
        replaceDoc(r.doc);
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
    return tpl ? cardSideSlots(tpl, side, api.lang, api.specs) : [];
  }, [side, front, back, api.lang, api.specs]);

  const oneQ = useLiveQuote(ONE_SIDED, api.lang);
  const twoQ = useLiveQuote(TWO_SIDED, api.lang);
  const one: number | null = quoteTotal(oneQ);
  const two: number | null = quoteTotal(twoQ);
  const hasBack: boolean = state.backId != null;
  const total: number | null = hasBack ? two : one;
  // A free text of this side still shows its sample (drawn, not printed).
  const untouched: boolean = slots.some((s) => s.kind === "text" && !(state.texts[s.id] ?? "").trim());
  const spec: StudioSurfaceSpec | undefined = api.specs.find((s) => s.id === (side === "back" ? CARD_BACK_ID : CARD_FRONT_ID));
  const docReady: boolean = side === "front" || cardHasBack(api.doc);
  const sideLabel: string = t(side === "back" ? "back" : "front");
  const extra: string = formatPrice(SHOP_BC_BACK_PER_CARD_MDL, api.lang);

  const toggleBack = (on: boolean) => {
    onState(cardShortWithBack(state, on, lastBack.current));
    setSide(on ? "back" : "front");
  };
  const tab = (on: boolean) => `flex min-h-11 items-center gap-1.5 rounded-[9px] px-4 text-sm font-bold whitespace-nowrap ${on ? "bg-(--ink) text-white" : "text-(--ink)"}`;
  const sideChoice = (on: boolean) =>
    `flex min-h-12 flex-1 flex-col items-start justify-center rounded-xl border-[1.5px] px-3 py-1.5 text-left text-sm font-bold ${on ? "border-(--ink) bg-(--ink) text-white" : "border-(--line2) bg-white text-(--ink) hover:border-(--ink)"}`;

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col" data-studio-card-short>
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
                  {t("addBackFull", { price: extra })}
                </button>
              )}
            </div>
            <button type="button" data-studio-card-other-model onClick={onGallery} className="min-h-11 rounded-xl px-2 text-sm font-bold underline underline-offset-2">
              {t("backToGallery")}
            </button>
          </div>
          <div className={`mx-auto w-full py-1 transition-[max-width] duration-200 lg:max-w-[640px] lg:py-4 ${typing ? "max-w-[190px]" : "max-w-[300px] md:max-w-[420px]"}`} data-studio-card-short-compact={typing || undefined}>{spec && docReady ? <ShortPreview api={api} spec={spec} label={t("preview", { side: sideLabel })} /> : <div className="w-full rounded-md bg-(--soft)" style={{ aspectRatio: spec ? `${spec.widthMm} / ${spec.heightMm}` : "94 / 54" }} />}</div>
          <p className={`m-0 text-center text-[11px] text-(--muted2) ${typing ? "hidden lg:block" : ""}`}>{t("guides")}</p>
          {untouched ? <p className={`m-0 text-center text-[11px] text-(--muted2) ${typing ? "hidden lg:block" : ""}`} data-studio-card-samples-note>{t("samplesNote")}</p> : null}
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
            {slots.map((s) => {
              if (s.kind === "photo") return <PhotoSlot key={s.key} api={api} state={state} onState={onState} />;
              const free: CardSlotInfo[] = slots.filter((x) => x.kind === "text");
              const n: number = free.length > 1 ? free.indexOf(s) + 1 : 0;
              return <SlotInput key={s.key} api={api} slot={s} n={n} fields={fields} state={state} set={set} onState={onState} />;
            })}
          </section>

          <section className="flex flex-col gap-3 rounded-2xl bg-[#faf3dc] p-3 md:p-4" aria-label={t("colors")}>
            <CardLogoButton api={api} fields={fields} set={set} />
            <CardColorsRow api={api} fields={fields} set={set} logoPalette={logoPalette} presets />
          </section>

          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-2 p-0 text-[15px] font-bold">{t("sides")}</legend>
            <div className="flex gap-2">
              <button type="button" aria-pressed={!hasBack} data-studio-card-sides-one className={sideChoice(!hasBack)} onClick={() => toggleBack(false)}>
                {t("sidesOne")}
                <span className="text-xs font-semibold opacity-80">{one != null ? t("packPrice", { price: formatPrice(one, api.lang), n: SHOP_BC_DEFAULT_PACK }) : "…"}</span>
              </button>
              <button type="button" aria-pressed={hasBack} data-studio-card-sides-two className={sideChoice(hasBack)} onClick={() => toggleBack(true)}>
                {t("sidesTwo")}
                <span className="text-xs font-semibold opacity-80">{two != null ? t("packPrice", { price: formatPrice(two, api.lang), n: SHOP_BC_DEFAULT_PACK }) : t("addBackPrice", { price: extra })}</span>
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
        <span className="ml-auto text-right text-sm leading-tight">
          <b className="block text-base" data-studio-card-short-total aria-live="polite">
            {total != null ? formatPrice(total, api.lang) : "…"}
          </b>
          <span className="text-xs text-(--muted)">{t("pcs", { n: SHOP_BC_DEFAULT_PACK })}</span>
        </span>
        <button type="button" data-studio-card-short-continue onClick={onContinue} className="shop-btn-dark flex min-h-12 items-center rounded-xl bg-(--ink) px-5 text-[15px] font-extrabold whitespace-nowrap text-white">
          {t("continue")} →
        </button>
      </div>
    </div>
  );
}

