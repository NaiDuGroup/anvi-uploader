"use client";

import { useMemo } from "react";
import { SHOP_BC_BACK_PER_CARD_MDL, SHOP_BC_DEFAULT_PACK } from "@/lib/storefront/businessCards";
import { formatPrice } from "@/lib/storefront/format";
import type { ShopLang } from "@/lib/storefront/i18n";
import { useLiveQuote, type LiveQuoteState } from "@/lib/storefront/quoteClient";
import type { ShopQuoteLine } from "@/lib/storefront/types";
import { cardQuoteLine } from "@/lib/studio/cardLine";
import type { StudioSurface } from "@/lib/studio/document";
import { FLYER_DEFAULT_FORMAT, FLYER_IDS, flyerDefaultOptions, flyerListTotal, flyerFormat, flyerFormatOfDoc, flyerProduct, flyerQuoteLine, type FlyerFormatId } from "@/lib/studio/flyer";
import { studioCardT } from "@/lib/studio/i18n.card";
import { studioFlyerT } from "@/lib/studio/i18n.flyer";
import { CARD_BACK_ID, type SheetStudioKind } from "@/lib/studio/surfaces";

/**
 * Pieces of the flyer Studio (`flyer`) shared by its screens — which are the
 * business card's (StudioCard*.tsx, the flyer branches): the format switch
 * and the one- / two-sided prices of the default pack.
 */

/** Quote of a line, done or the previous answer while a new one loads. */
export function quoteTotalOf(q: LiveQuoteState): number | null {
  if (q.status === "done" && q.line.ok) return q.line.total;
  if (q.status === "loading" && q.previous?.ok) return q.previous.total;
  return null;
}

const CARD_ONE: ShopQuoteLine = cardQuoteLine({ surfaces: [] });
const CARD_TWO: ShopQuoteLine = cardQuoteLine({ surfaces: [{ id: CARD_BACK_ID } as StudioSurface] });

/** The default pack's one- / two-sided line (flyers: of a format). */
export function sheetSideLines(kind: SheetStudioKind, format: FlyerFormatId): [ShopQuoteLine, ShopQuoteLine] {
  if (kind !== "flyer") return [CARD_ONE, CARD_TWO];
  const o = flyerDefaultOptions(format);
  return [flyerQuoteLine({ surfaces: [] }, o) as ShopQuoteLine, flyerQuoteLine({ surfaces: [{ id: CARD_BACK_ID }] as StudioSurface[] }, o) as ShopQuoteLine];
}

/**
 * Prices of the default pack, front only / both sides (live quotes), and
 * the back's extra as shown on «Adaugă verso»: a business card's fixed
 * «+0,50 lei/buc.»; a flyer's two-sided total minus the one-sided one (null
 * while it loads). `quote: false` asks nothing (the card side bar never did).
 */
export function useSheetSidePrices(kind: SheetStudioKind, lang: ShopLang, format: FlyerFormatId, quote = true): { one: number | null; two: number | null; extra: string | null; pack: number } {
  const [oneLine, twoLine] = useMemo(() => sheetSideLines(kind, format), [kind, format]);
  // Flyers are priced from the list right here (the same `psLinePrice` the server answers with): another
  // format shows its own price at once, never the previous one while a quote loads.
  const live: boolean = quote && kind !== "flyer";
  const oneLive: number | null = quoteTotalOf(useLiveQuote(live ? oneLine : null, lang));
  const twoLive: number | null = quoteTotalOf(useLiveQuote(live ? twoLine : null, lang));
  if (kind !== "flyer") return { one: oneLive, two: twoLive, extra: formatPrice(SHOP_BC_BACK_PER_CARD_MDL, lang), pack: SHOP_BC_DEFAULT_PACK };
  const one: number | null = quote ? flyerListTotal(oneLine) : null;
  const two: number | null = quote ? flyerListTotal(twoLine) : null;
  return { one, two, extra: one != null && two != null ? formatPrice(Math.max(0, two - one), lang) : null, pack: flyerProduct().defaultPack };
}


/** «A6 · 105×148 mm» … — the flyer format switch (gallery, short edit, verify). */
export function FlyerFormatChips({ lang, value, onChange, disabled = false }: { lang: ShopLang; value: FlyerFormatId; onChange: (f: FlyerFormatId) => void; disabled?: boolean }) {
  const t = studioFlyerT(lang);
  const chip = (on: boolean) =>
    `flex min-h-11 flex-none flex-col items-start justify-center rounded-xl border-[1.5px] px-3 py-1 text-left text-sm font-bold whitespace-nowrap disabled:opacity-50 ${on ? "border-(--ink) bg-(--ink) text-white" : "border-(--line2) bg-white text-(--ink) hover:border-(--ink)"}`;
  return (
    <div role="group" aria-label={t("format")} className="flex gap-1.5 overflow-x-auto pb-1" data-studio-flyer-formats>
      {FLYER_IDS.map((id) => {
        const f = flyerFormat(id);
        const on: boolean = value === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            data-studio-flyer-format={id}
            aria-label={t("formatOption", { name: f.name ?? id.toUpperCase(), w: f.trimMm.width, h: f.trimMm.height })}
            className={chip(on)}
            onClick={() => onChange(id)}
          >
            <span>{f.name ?? id.toUpperCase()}</span>
            <span className={`text-[11px] font-semibold ${on ? "text-white/80" : "text-(--muted)"}`}>
              {f.trimMm.width}×{f.trimMm.height} mm
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** The flyer format a set of surfaces is drawn at (A5 when it is none of them). */
export function flyerFormatOfSpecs(specs: readonly { widthMm: number; heightMm: number }[]): FlyerFormatId {
  return flyerFormatOfDoc({ surfaces: specs as unknown as StudioSurface[] }) ?? FLYER_DEFAULT_FORMAT;
}

/** Over a preview while the design is laid out again for another format: a soft veil and a small spinner. */
export function SheetRecalculating({ lang }: { lang: ShopLang }) {
  return (
    <span role="status" className="absolute inset-0 z-[1] flex items-center justify-center gap-2 bg-white/85 text-xs font-bold text-(--muted)" data-studio-sheet-recalculating>
      <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-(--line2) border-t-(--ink)" />
      {studioCardT(lang)("recalculating")}
    </span>
  );
}
