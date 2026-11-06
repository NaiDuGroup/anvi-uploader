"use client";

import { useEffect, useRef } from "react";
import type { ShopLang } from "@/lib/storefront/i18n";
import type { StudioImageLayer, StudioImageSrc } from "@/lib/studio/document";
import { studioPhotoT } from "@/lib/studio/i18n.photo";
import { PHOTO_FILTERS, PHOTO_SLIDER_KEYS, isIdentityEdit, rotateQuarter, withPhotoEdit, type PhotoFilter } from "@/lib/studio/photoEdit";
import { measureAutoEnhance } from "@/lib/studio/photoEditCanvas";
import { drawLayerLocal, type StudioRenderAssets } from "@/lib/studio/render";
import { Icon, Slider } from "./StudioUi";

const ICON = {
  rotate: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7",
  flipX: "M12 3v18M8 7 3 12l5 5zM16 7l5 5-5 5z",
  flipY: "M3 12h18M7 8l5-5 5 5zM7 16l5 5 5-5z",
  auto: "M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8zM18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9zM5 15l.6 1.4L7 17l-1.4.6L5 19l-.6-1.4L3 17l1.4-.6z",
  reset: "M4 4v6h6M4.5 15a8 8 0 1 0 1.9-8.3L4 10",
} as const;

/**
 * Photo tools for one photo (short «Personalizează» form and the advanced
 * editor): turn 90°, mirror, six one-tap filters with live thumbnails,
 * brightness / contrast / saturation, «Auto-îmbunătățire» and «Resetează».
 * Changes the photo source's `edit` only (non-destructive, see photoEdit.ts);
 * every output draws it through the same renderer.
 */
export function StudioPhotoTools({
  lang,
  layer,
  assets,
  onSrc,
  lowRes = false,
}: {
  lang: ShopLang;
  layer: StudioImageLayer;
  assets: StudioRenderAssets;
  /** New source (same photo, another edit); `tag` coalesces a slider drag into one undo step. */
  onSrc: (src: StudioImageSrc, tag: string) => void;
  /** The photo is below the print resolution: say what auto-enhance can and cannot do. */
  lowRes?: boolean;
}) {
  const t = studioPhotoT(lang);
  const src = layer.src;
  if (!src) return null;
  const e = src.edit ?? {};
  const set = (patch: Parameters<typeof withPhotoEdit>[1], tag: string) => onSrc(withPhotoEdit(src, patch), `photo:${layer.id}:${tag}`);
  const autoOn: boolean = !!e.levels || !!e.sharpen;
  const btn =
    "flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl whitespace-nowrap border-[1.5px] border-(--line2) bg-white px-2 text-[13px] font-bold text-(--ink) hover:border-(--ink) disabled:opacity-40";
  const runAuto = () => {
    if (autoOn) {
      set({ levels: undefined, sharpen: undefined, saturation: Math.max(0, (e.saturation ?? 0) - 10) || undefined }, "auto");
      return;
    }
    const bmp = assets.image(layer);
    const p = bmp ? measureAutoEnhance(bmp) : null;
    if (!p) return;
    set({ ...p, saturation: Math.min(100, (e.saturation ?? 0) + (p.saturation ?? 0)) }, "auto");
  };
  return (
    <div className="flex flex-col gap-3" data-studio-photo-tools={layer.id}>
      <div className="flex gap-2">
        <button type="button" className={btn} onClick={() => set(rotateQuarter(e), "rotate")} aria-label={t("rotateFull")} title={t("rotateFull")} data-studio-photo-rotate>
          <Icon d={ICON.rotate} size={18} />
          {t("rotate")}
        </button>
        <button type="button" className={btn} aria-pressed={!!e.flipX} onClick={() => set({ flipX: !e.flipX }, "flipx")} data-studio-photo-flip>
          <Icon d={ICON.flipX} size={18} />
          {t("flipX")}
        </button>
        <button type="button" className={`${btn} flex-none px-3`} aria-pressed={!!e.flipY} aria-label={t("flipY")} title={t("flipY")} onClick={() => set({ flipY: !e.flipY }, "flipy")}>
          <Icon d={ICON.flipY} size={18} />
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        {lowRes ? (
          <p className="m-0 rounded-[10px] bg-(--warn-soft) px-3 py-2 text-xs font-semibold text-(--warn)" data-studio-photo-lowres>
            {t("lowRes")}
          </p>
        ) : null}
        <button
          type="button"
          onClick={runAuto}
          aria-pressed={autoOn}
          data-studio-photo-auto
          className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 text-sm font-extrabold ${autoOn ? "border-[1.5px] border-(--ink) bg-[#e7f5ec] text-[#1f6b3c]" : "bg-(--ink) text-white"}`}
        >
          <Icon d={ICON.auto} size={18} />
          {autoOn ? `✓ ${t("autoOn")} · ${t("autoUndo")}` : t("auto")}
        </button>
        {!autoOn ? <span className="text-xs text-(--muted)">{t("autoHint")}</span> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-bold text-(--muted2)">{t("filters")}</span>
        <div className="grid grid-cols-6 gap-1.5" role="radiogroup" aria-label={t("filters")}>
          {PHOTO_FILTERS.map((f) => (
            <FilterTile key={f} layer={layer} filter={f} assets={assets} label={t(`filter_${f}`)} on={(e.filter ?? "none") === f} onPick={() => set({ filter: f }, "filter")} />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        {PHOTO_SLIDER_KEYS.map((k) => (
          <Slider key={k} label={t(k)} value={e[k] ?? 0} min={-100} max={100} step={1} format={(v) => (v > 0 ? `+${v}` : String(v))} onChange={(v) => set({ [k]: v }, k)} />
        ))}
      </div>

      <button type="button" className={btn} disabled={isIdentityEdit(src.edit)} onClick={() => onSrc(withPhotoEdit(src, null), `photo:${layer.id}:reset`)} title={t("resetHint")} data-studio-photo-reset>
        <Icon d={ICON.reset} size={18} />
        {t("reset")}
      </button>
    </div>
  );
}

/** One filter: the photo (as framed now, with the other adjustments) under that filter. */
function FilterTile({ layer, filter, assets, label, on, onPick }: { layer: StudioImageLayer; filter: PhotoFilter; assets: StudioRenderAssets; label: string; on: boolean; onPick: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const src = layer.src;
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx || !src) return;
    const dpr: number = Math.min(2, window.devicePixelRatio || 1);
    const side = 48;
    c.width = Math.round(side * dpr);
    c.height = Math.round(side * dpr);
    ctx.clearRect(0, 0, c.width, c.height);
    const tile: StudioImageLayer = { ...layer, x: 0, y: 0, w: side, h: side, rotation: 0, mask: "rect", frame: undefined, opacity: undefined, crop: { zoom: 1, ox: 0, oy: 0 }, src: withPhotoEdit(src, { filter }) };
    drawLayerLocal(ctx, tile, assets, { pxPerMm: dpr });
  }, [layer, src, filter, assets]);
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onPick} className="flex min-w-0 flex-col items-center gap-1" data-studio-photo-filter={filter}>
      <canvas ref={ref} aria-hidden="true" className={`block aspect-square w-full rounded-lg border-2 ${on ? "border-(--ink)" : "border-transparent"}`} />
      <span className={`w-full truncate text-center text-[10px] leading-tight font-bold ${on ? "text-(--ink)" : "text-(--muted)"}`}>{label}</span>
    </button>
  );
}
