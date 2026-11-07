"use client";

import { studioEditorPath } from "@/lib/storefront/design";
import type { ShopProduct } from "@/lib/storefront/types";
import { studioApparelT } from "@/lib/studio/i18n.apparel";
import { BusinessCardChoice } from "./BusinessCardChoice";
import { ProductView, type ProductViewExtras } from "./ProductView";
import { useShopLang } from "./ShopLangProvider";

/**
 * A DTF garment page (T-shirt / polo / cap) for viewers who may use the
 * apparel Studio (`studioApparelAllowed`): «Creează online» (ANVI Studio) and
 * «Încarcă fișierul tău» (the product page as before). Editing an uploaded
 * cart line opens on the upload tab. Without the gate the page renders
 * `ProductView` only, as before.
 */
export function ApparelChoice({ product, editId, extras, badge }: { product: ShopProduct; editId: string | null; extras: ProductViewExtras; badge: boolean }) {
  const { lang, href } = useShopLang();
  const t = studioApparelT(lang);
  return (
    <BusinessCardChoice
      kind="apparel"
      text={{
        tabCreate: t("tabCreate"),
        tabCreateSub: t("tabCreateSub"),
        tabUpload: t("tabUpload"),
        tabUploadSub: t("tabUploadSub"),
        createTitle: t("createTitle"),
        createLead: t("createLead"),
        steps: [t("createStep1"), t("createStep2"), t("createStep3")],
        createCta: t("createCta"),
        ...(badge ? { badge: t("testBadge") } : {}),
      }}
      studioHref={href(studioEditorPath("apparel", { slug: product.slug, fresh: true }))}
      initial={editId ? "upload" : "create"}
      upload={<ProductView product={product} editId={editId} extras={extras} />}
    />
  );
}
