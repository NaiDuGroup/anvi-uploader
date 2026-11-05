"use client";

import { useMemo, useState, type ReactNode } from "react";
import { studioViewsT } from "@/lib/studio/i18n.views";
import { MUG_VIEWS, isMagicMug, mugOpeningU, mugViewOfU, mugViewU, type MugView } from "@/lib/studio/mugViews";
import type { StudioEditorApi } from "./StudioApp";

/**
 * Fixed views of the 3D mug (Stânga / Față / Dreapta; dragging still turns
 * it) and, on a magic mug, the Rece / Fierbinte toggle. The hook keeps the
 * state; the 3D preview gets `viewRequest` and `magic`, the bar goes over or
 * under it. Automation: `data-studio-view="left|front|right"`,
 * `data-studio-magic="cold|hot"`.
 */

const VIEW_KEY = {
  left: "viewLeft",
  front: "viewFront",
  right: "viewRight",
} as const;

/** True for a thermo-magic mug (product, variant or catalog item named so). */
export function useIsMagicMug(api: Pick<StudioEditorApi, "kind" | "product" | "variant" | "item">): boolean {
  const { kind, product, variant, item } = api;
  return useMemo(
    () =>
      kind === "mug" &&
      isMagicMug(
        product.slug,
        product.name,
        variant?.label,
        typeof item?.sku === "string" ? item.sku : null,
        typeof item?.nameRo === "string" ? item.nameRo : null,
        typeof item?.nameRu === "string" ? item.nameRu : null,
        typeof item?.nameEn === "string" ? item.nameEn : null,
      ),
    [kind, product.slug, product.name, variant?.label, item],
  );
}

export function useMugViewControls(
  api: Pick<StudioEditorApi, "kind" | "product" | "variant" | "item" | "spec" | "doc" | "lang">,
  opts: { size?: "sm" | "md" } = {},
): {
  viewRequest: { u: number; n: number } | null;
  magic: "cold" | "hot" | null;
  bar: ReactNode;
} {
  const t = studioViewsT(api.lang);
  const magicMug: boolean = useIsMagicMug(api);
  const [req, setReq] = useState<{ view: MugView; n: number } | null>(null);
  const [opening] = useState<MugView>(() => mugViewOfU(api.spec, mugOpeningU(api.doc, api.spec)));
  const [magic, setMagic] = useState<"cold" | "hot">("hot");
  const active: MugView = req?.view ?? opening;
  const viewRequest = useMemo(() => (req ? { u: mugViewU(api.spec, req.view), n: req.n } : null), [req, api.spec]);
  if (api.kind !== "mug") return { viewRequest: null, magic: null, bar: null };
  const h: string = opts.size === "sm" ? "min-h-9 px-2 text-xs" : "min-h-11 px-3 text-sm";
  const seg = (on: boolean) => `${h} rounded-[8px] font-bold ${on ? "bg-(--ink) text-white" : "text-(--ink)"}`;
  // Without a 3D model (flat preview) the view buttons have nothing to turn.
  const bar = (
    <div className="flex flex-wrap items-center gap-2">
      {api.item?.has3dPreview !== false ? (
        <div role="group" aria-label={t("views")} className="flex rounded-[10px] bg-white/95 p-0.5 shadow-[0_2px_8px_rgba(20,33,61,0.12)]">
          {MUG_VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              data-studio-view={v}
              aria-pressed={active === v}
              onClick={(e) => {
                e.stopPropagation();
                setReq((r) => ({ view: v, n: (r?.n ?? 0) + 1 }));
              }}
              className={seg(active === v)}
            >
              {t(VIEW_KEY[v])}
            </button>
          ))}
        </div>
      ) : null}
      {magicMug ? (
        <div role="group" aria-label={t("magic")} className="flex rounded-[10px] bg-white/95 p-0.5 shadow-[0_2px_8px_rgba(20,33,61,0.12)]">
          {(["cold", "hot"] as const).map((m) => (
            <button
              key={m}
              type="button"
              data-studio-magic={m}
              aria-pressed={magic === m}
              title={m === "cold" ? t("magicColdHint") : undefined}
              onClick={(e) => {
                e.stopPropagation();
                setMagic(m);
              }}
              className={seg(magic === m)}
            >
              {m === "cold" ? `❄ ${t("magicCold")}` : `☕ ${t("magicHot")}`}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
  return { viewRequest, magic: magicMug ? magic : null, bar };
}
