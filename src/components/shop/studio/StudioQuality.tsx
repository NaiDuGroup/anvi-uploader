"use client";

import { useMemo } from "react";
import type { ShopLang } from "@/lib/storefront/i18n";
import { studioShopT } from "@/lib/studio/i18n.shop";
import {
  evaluateStudioQuality,
  studioQualityBlocks,
  studioQualityCounts,
  studioQualityMessage,
  type StudioQualityItem,
} from "@/lib/studio/quality";
import { studioPhotoSampler } from "@/lib/studio/photoSampler";
import type { StudioEditorApi } from "./StudioApp";

/**
 * «Verificare calitate»: the print checks of the current design in plain
 * words (traffic light). Red items block «Continuă»; yellow ones are accepted
 * with «Am înțeles, continuă oricum».
 */

export interface StudioQualityState {
  items: StudioQualityItem[];
  red: number;
  yellow: number;
  blocks: boolean;
}

/** Quality of the editor's document (recomputed only when the document, print area, product colour or photos change). */
export function useStudioQuality(api: Pick<StudioEditorApi, "doc" | "specs" | "productColor"> & Partial<Pick<StudioEditorApi, "renderAssets" | "version">>): StudioQualityState {
  const { doc, specs, productColor, renderAssets, version } = api;
  return useMemo(() => {
    const photoColorAt = renderAssets ? studioPhotoSampler(doc, specs, renderAssets) : null;
    const items = evaluateStudioQuality(doc, specs, { productColorHex: productColor, ...(photoColorAt ? { photoColorAt } : {}) });
    const c = studioQualityCounts(items);
    // Reds first, then yellows, each in layer order.
    items.sort((a, b) => (a.level === b.level ? 0 : a.level === "red" ? -1 : 1));
    return { items, red: c.red, yellow: c.yellow, blocks: studioQualityBlocks(items) };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version: photos finished loading
  }, [doc, specs, productColor, renderAssets, version]);
}

const DOT: Record<"red" | "yellow" | "ok", string> = { red: "#c0392b", yellow: "#c98a0b", ok: "#1f8a4c" };

function Glyph({ level }: { level: "red" | "yellow" | "ok" }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-6 w-6 flex-none items-center justify-center rounded-full text-[13px] font-extrabold text-white"
      style={{ background: DOT[level] }}
    >
      {level === "red" ? "×" : level === "yellow" ? "!" : "✓"}
    </span>
  );
}

/** Compact traffic light for the top bar: counts, opens the list. */
export function StudioQualityChip({ q, lang, onClick, compact }: { q: StudioQualityState; lang: ShopLang; onClick: () => void; compact?: boolean }) {
  const t = studioShopT(lang);
  const level: "red" | "yellow" | "ok" = q.red ? "red" : q.yellow ? "yellow" : "ok";
  const label: string = q.red ? t("qualityRed", { n: q.red }) : q.yellow ? t("qualityYellow", { n: q.yellow }) : t("qualityOk");
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${t("qualityTitle")}: ${label}`}
      title={label}
      className="flex h-11 flex-none items-center gap-1.5 rounded-[10px] border-[1.5px] border-(--line2) bg-white px-2 text-[13px] font-bold md:h-10"
    >
      <Glyph level={level} />
      {compact ? <span>{q.red || q.yellow || t("qualityOkShort")}</span> : <span className="hidden xl:inline">{label}</span>}
    </button>
  );
}

/** The list (right column on desktop, sheet on phones, dialog before continuing). */
export function StudioQualityList({
  q,
  lang,
  onPick,
  selectedId,
}: {
  q: StudioQualityState;
  lang: ShopLang;
  onPick: (item: StudioQualityItem) => void;
  selectedId?: string | null;
}) {
  const t = studioShopT(lang);
  return (
    <section aria-label={t("qualityTitle")} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="m-0 text-base font-extrabold">{t("qualityTitle")}</h2>
        {q.red ? <span className="rounded-full bg-[#fdecea] px-2 py-0.5 text-xs font-bold text-[#a82e22]">× {q.red}</span> : null}
        {q.yellow ? <span className="rounded-full bg-[#fdf3dc] px-2 py-0.5 text-xs font-bold text-[#8a5d00]">! {q.yellow}</span> : null}
        {!q.red && !q.yellow ? <span className="rounded-full bg-[#e7f5ec] px-2 py-0.5 text-xs font-bold text-[#1f6b3c]">✓ {t("qualityOk")}</span> : null}
      </div>
      {q.items.length === 0 ? (
        <p className="m-0 text-[13px] text-(--muted2)">{t("qualityLead")}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {q.items.map((it) => {
            const m = studioQualityMessage(it, lang);
            const active = it.layerId != null && it.layerId === selectedId;
            return (
              <li key={it.id}>
                <button
                  type="button"
                  onClick={() => onPick(it)}
                  className={`flex min-h-12 w-full items-start gap-2 rounded-xl border-[1.5px] p-2 text-left ${
                    active ? "border-(--ink)" : it.level === "red" ? "border-[#f2c4bf] bg-[#fdf6f5]" : "border-[#f1dfb0] bg-[#fffaf0]"
                  }`}
                >
                  <Glyph level={it.level} />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <b className="text-[13px] leading-snug">{m.title}</b>
                    <span className="text-xs leading-snug text-(--muted)">{m.fix}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Before verifying: reds block, yellows need an explicit «continue anyway». */
export function StudioQualityDialog({
  q,
  lang,
  onPick,
  onAccept,
  onClose,
}: {
  q: StudioQualityState;
  lang: ShopLang;
  onPick: (item: StudioQualityItem) => void;
  onAccept: () => void;
  onClose: () => void;
}) {
  const t = studioShopT(lang);
  return (
    <div role="dialog" aria-modal="true" aria-label={t("qualityDialog")} className="fixed inset-0 z-[80] flex items-end justify-center bg-[rgba(20,33,61,0.45)] md:items-center" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-[460px] flex-col gap-3 overflow-y-auto rounded-t-2xl bg-white p-4 md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <StudioQualityList q={q} lang={lang} onPick={onPick} />
        {q.blocks ? (
          <p role="alert" className="m-0 rounded-xl bg-[#fdecea] px-3 py-2 text-sm font-bold text-[#a82e22]">
            {t("qualityBlocked")}
          </p>
        ) : null}
        <button
          type="button"
          disabled={q.blocks}
          onClick={onAccept}
          className="min-h-12 rounded-xl bg-(--ink) px-4 font-extrabold text-white disabled:opacity-40"
        >
          {q.blocks ? t("qualityBlocked") : t("qualityAccept")}
        </button>
        <p className="m-0 text-center text-xs text-(--muted2)">{t("qualityAcceptNote")}</p>
        <button type="button" onClick={onClose} className="min-h-12 rounded-xl border-[1.5px] border-(--line2) font-bold">
          {t("close")}
        </button>
      </div>
    </div>
  );
}
