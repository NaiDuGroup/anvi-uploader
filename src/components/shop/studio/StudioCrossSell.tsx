"use client";

import { useEffect, useMemo, useState } from "react";
import type { ShopLang } from "@/lib/storefront/i18n";
import { adaptStudioDoc } from "@/lib/studio/adapt";
import type { StudioDoc, StudioKind } from "@/lib/studio/document";
import { renderPreviewCanvas } from "@/lib/studio/exportClient";
import { studioPreviewT } from "@/lib/studio/i18n.preview";
import type { StudioRenderAssets } from "@/lib/studio/render";
import type { StudioSurfaceSpec } from "@/lib/studio/surfaces";
import type { StudioCatalogItem } from "./StudioApp";
import { StudioLive3DLazy } from "./StudioLive3DLazy";

/**
 * «Designul tău pe alte produse»: the same design adapted to the other Studio
 * products (`adaptStudioDoc`), each with a 2D thumbnail (3D on request for
 * mug / notebook), price and «Adaugă». The carousel scrolls inside itself
 * (scroll-snap), never the page.
 */

export interface StudioCrossSellTarget {
  kind: StudioKind;
  slug: string;
  name: string;
  priceText?: string | null;
  specs: StudioSurfaceSpec[];
  item?: StudioCatalogItem | null;
}

export interface StudioCrossSellProps {
  doc: StudioDoc;
  fromKind: StudioKind;
  lang: ShopLang;
  renderAssets: StudioRenderAssets;
  targets: StudioCrossSellTarget[];
  onAdd: (target: { kind: StudioKind; slug: string; doc: StudioDoc }) => void;
  onEdit?: (target: { kind: StudioKind; slug: string; doc: StudioDoc }) => void;
  title?: string;
}

function productColorOf(item: StudioCatalogItem | null | undefined): string {
  const c = item?.bodyColorHex ?? item?.coverColorHex;
  return typeof c === "string" ? c : "#ffffff";
}

function CrossCard({
  target,
  doc,
  lang,
  renderAssets,
  onAdd,
  onEdit,
}: {
  target: StudioCrossSellTarget;
  doc: StudioDoc;
  lang: ShopLang;
  renderAssets: StudioRenderAssets;
  onAdd: StudioCrossSellProps["onAdd"];
  onEdit?: StudioCrossSellProps["onEdit"];
}) {
  const t = studioPreviewT(lang);
  const spec: StudioSurfaceSpec = target.specs[0]!;
  const [show3d, setShow3d] = useState(false);
  const [thumb, setThumb] = useState<string | null>(null);
  const can3d: boolean = target.kind !== "pen" && target.item?.has3dPreview !== false;

  // Drawn once per design / photo set (small PNG data URL; the canvas is freed right after).
  useEffect(() => {
    let cancelled = false;
    const id = window.setTimeout(() => {
      try {
        const c = renderPreviewCanvas(doc, spec, renderAssets, 420);
        const url: string = c.toDataURL("image/png");
        c.width = 0;
        c.height = 0;
        if (!cancelled) setThumb(url);
      } catch {
        if (!cancelled) setThumb(null);
      }
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [doc, spec, renderAssets]);

  const payload = { kind: target.kind, slug: target.slug, doc };
  return (
    <li
      className="flex w-[240px] flex-none snap-start flex-col gap-2 rounded-[14px] border-[1.5px] border-(--line) bg-white p-3 sm:w-[260px]"
      aria-label={t("crossCardLabel", { name: target.name })}
    >
      <div
        className="relative flex h-[160px] items-center justify-center overflow-hidden rounded-[10px]"
        style={{ background: "radial-gradient(ellipse at 50% 40%, #ffffff 0%, #eef1f5 100%)" }}
      >
        {show3d && can3d ? (
          <StudioLive3DLazy
            kind={target.kind}
            item={target.item ?? null}
            spec={spec}
            doc={doc}
            renderAssets={renderAssets}
            version={0}
            interactive
            autoRotate
            className="h-full w-full"
            style={{ position: "absolute", inset: 0, minHeight: 0, background: "transparent" }}
          />
        ) : thumb ? (
          // eslint-disable-next-line @next/next/no-img-element -- local data URL
          <img
            src={thumb}
            alt={t("flatAlt")}
            className={`block max-h-[136px] max-w-[92%] object-contain shadow-[0_4px_12px_rgba(20,33,61,0.15)] ${target.kind === "pen" ? "rounded-full px-2" : "rounded-[3px]"}`}
            style={{ background: productColorOf(target.item) }}
          />
        ) : (
          <span className="h-full w-full animate-pulse bg-(--soft)" aria-hidden="true" />
        )}
        {can3d ? (
          <button
            type="button"
            onClick={() => setShow3d((v) => !v)}
            aria-pressed={show3d}
            className="absolute top-1.5 right-1.5 min-h-9 rounded-full bg-white/95 px-3 text-xs font-extrabold text-(--ink) shadow-[0_2px_8px_rgba(20,33,61,0.15)]"
          >
            {show3d ? t("crossShow2d") : t("crossShow3d")}
          </button>
        ) : null}
      </div>
      <div className="flex min-h-10 items-baseline justify-between gap-2">
        <b className="text-sm leading-tight">{target.name}</b>
        {target.priceText ? <span className="text-sm font-extrabold whitespace-nowrap">{target.priceText}</span> : null}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onAdd(payload)}
          className="shop-btn-dark min-h-12 flex-1 rounded-[10px] bg-(--ink) text-[15px] font-extrabold text-white"
        >
          {t("crossAdd")}
        </button>
        {onEdit ? (
          <button
            type="button"
            onClick={() => onEdit(payload)}
            className="min-h-12 rounded-[10px] border-[1.5px] border-(--line2) bg-white px-3 text-sm font-bold text-(--ink)"
          >
            {t("crossEdit")}
          </button>
        ) : null}
      </div>
    </li>
  );
}

/** What shows through a transparent design: the pen / mug body or the notebook cover. */
export function targetProductColor(item: StudioCatalogItem | null | undefined): string | null {
  if (!item) return null;
  const c: unknown = item.bodyColorHex ?? item.coverColorHex;
  return typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c) ? c : null;
}

export function StudioCrossSell({ doc, fromKind, lang, renderAssets, targets, onAdd, onEdit, title }: StudioCrossSellProps) {
  const t = studioPreviewT(lang);
  // One adapted document per target, recomputed only when the design changes.
  const adapted = useMemo(
    () =>
      targets.map((target) => ({
        target,
        doc: target.kind === fromKind && target.specs[0]?.widthMm === doc.surfaces[0]?.widthMm && target.specs[0]?.heightMm === doc.surfaces[0]?.heightMm
          ? doc
          : adaptStudioDoc(doc, target.kind, target.specs, { productColorHex: targetProductColor(target.item) }),
      })),
    [doc, fromKind, targets],
  );
  if (adapted.length === 0) return null;
  return (
    <section className="flex min-w-0 flex-col gap-3" aria-label={title ?? t("crossTitle")}>
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-lg font-extrabold sm:text-xl">{title ?? t("crossTitle")}</h2>
        <p className="m-0 text-sm text-(--muted2)">{t("crossSub")}</p>
      </div>
      <ul className="m-0 flex w-full max-w-full list-none snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain p-0 pb-2 [scrollbar-width:thin]">
        {adapted.map(({ target, doc: d }) => (
          <CrossCard key={`${target.kind}:${target.slug}`} target={target} doc={d} lang={lang} renderAssets={renderAssets} onAdd={onAdd} onEdit={onEdit} />
        ))}
      </ul>
    </section>
  );
}
