"use client";

import { useState } from "react";
import { designerHelpLabel } from "@/lib/studio/designerHelp";
import { studioDesignerT } from "@/lib/studio/i18n.designer";
import { useShopLang } from "../ShopLangProvider";
import { DesignerHelpDialog, PaletteIcon, useDesignerHelpPrice, type DesignerHelpTarget } from "./DesignerHelp";

/**
 * «Îl facem noi pentru tine» / «We design it for you» tile for the Studio
 * template gallery (StudioStart): same size as a template tile, opens the
 * designer request dialog. Self-contained: loads the price setting itself
 * (`GET /api/shop/design-request`) unless `priceLei` is passed.
 *
 * Drop-in: `<StudioDesignerCard kind="mug" slug={product.slug} variant={variantLabel} productName={product.name} />`
 * as the first (or last) child of the template grid. Automation: `data-designer-help="card"`.
 */
export function StudioDesignerCard({
  kind,
  slug,
  variant,
  productName,
  priceLei,
  className = "",
}: Omit<DesignerHelpTarget, "source"> & { priceLei?: number | null; className?: string }) {
  const { lang } = useShopLang();
  const t = studioDesignerT(lang);
  const price = useDesignerHelpPrice(priceLei);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        data-designer-help="card"
        onClick={() => setOpen(true)}
        className={`flex min-h-[150px] flex-col items-start justify-between gap-2 rounded-2xl border-2 border-dashed border-(--line2) bg-(--soft) p-3 text-left hover:border-(--ink) ${className}`}
      >
        <span className="grid h-10 w-10 place-items-center rounded-full bg-white text-(--ink)">
          <PaletteIcon size={22} />
        </span>
        <span className="flex flex-col gap-1">
          <b className="text-[15px] leading-tight">{t("cardTitle")}</b>
          <span className="text-xs leading-snug text-(--muted)">{t("cardText")}</span>
          <span className="text-xs font-bold leading-snug">{designerHelpLabel(lang, price ?? null)}</span>
        </span>
      </button>
      {open ? (
        <DesignerHelpDialog
          target={{ kind, slug, variant, productName, source: "studio" }}
          priceLei={price ?? null}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
