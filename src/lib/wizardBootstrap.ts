import "server-only";
import { parseGiftSetTemplates, type GiftSetTemplate } from "@/lib/giftSet/giftSet";
import { prisma } from "./prisma";
import { toAdminMugProductJson } from "./mug/toAdminMugProductJson";
import { toAdminNotebookProductJson } from "./notebook/toAdminNotebookProductJson";
import {
  toAdminLargeFormatMaterialJson,
  type AdminLargeFormatMaterialJson,
} from "./largeFormat/toAdminLargeFormatMaterialJson";
import { lfMaterialPrintableWidthByIdsRaw } from "./largeFormat/lfMaterialPrintableWidthSql";
import { findLfPricingMaterialsWithPresets } from "./largeFormat/lfMaterialStock";
import { findSheetPapersPricing } from "./businessCard/sheetPaperStock";
import {
  toAdminSheetPaperJson,
  type AdminSheetPaperJson,
} from "./businessCard/toAdminSheetPaperJson";
import { getOrCreateAccountingSettings } from "./accounting/accountingSettings";
import { parseProductionCostsJson } from "./accounting/types";
import { loadPrinterInkTank } from "./stock/unified/printerTanks";
import { DEFAULT_PRINT_PROCESS } from "./printProcess";
import { publicAssetUrlFromStorageKey } from "./mug/publicAssetUrl";
import type { MugProductOption } from "@/app/mug/_components/MugProductPicker";
import type { NotebookProductOption } from "@/app/notebook/_components/NotebookProductPicker";
import type { PenProductOption } from "@/app/pen/_components/PenProductPicker";
import {
  PEN_VARIANT_INCLUDE,
  PEN_VARIANT_ORDER_BY,
  PEN_VARIANT_WHERE,
  penVariantFields,
} from "@/lib/pen/penVariant";
import { listNotebookVariants } from "@/lib/notebook/notebookVariant";
import { listMugVariants } from "@/lib/mug/mugVariant";
import { loadDtfCatalog } from "./dtf/dtfCatalog";
import { loadUvCatalog } from "./uv/uvCatalog";
import type { UvCatalogJson } from "./uv/dto";
import { loadSublimationCatalog } from "./sublimation/sublimationCatalog";
import type { SublimationCatalogJson } from "./sublimation/dto";
import type { DtfCatalogJson } from "./dtf/dtfDto";
import { parseStickerSheetSettings, type StickerSheetSettings } from "./stickerSheet/stickerSheet";
import { parsePostcardSettings, type PostcardSettings } from "./postcard/postcard";

/**
 * Bundle of catalog + economics data needed by the admin "New Order" wizard.
 *
 * Previously the client mounted on `/admin/orders/new` and issued four
 * `useEffect`-driven fetches (`/api/admin/mug-products`,
 * `/api/admin/notebook-products`, `/api/admin/large-format-materials`,
 * `/api/admin/print-economics-settings`). Each one performed its own
 * `getSessionUser` round-trip and one or more catalog queries, totalling
 * ~9–11 round-trips to Neon and a client-side waterfall (RSC → mount → 4
 * fetches). On the EU↔US Vercel/Neon hop this turned into the 1–3 s
 * "blank screen" delay our admins reported.
 *
 * Now we resolve the bundle once on the server during the page's RSC
 * render, in a single `Promise.all`, and pass it to the wizard as props.
 * The shape mirrors the legacy API responses so the client only has to
 * drop its `useEffect` fetches and consume the props directly.
 */
export interface WizardBootstrapData {
  mugProducts: MugProductOption[];
  notebookProducts: NotebookProductOption[];
  penProducts: PenProductOption[];
  lfMaterials: AdminLargeFormatMaterialJson[];
  sheetPapers: AdminSheetPaperJson[];
  dtfCatalog: DtfCatalogJson;
  uvCatalog: UvCatalogJson;
  sublimationCatalog: SublimationCatalogJson;
  printEconomics: {
    inkMlPerSqmLargeFormatRoll: number;
    minimumOrderPriceMdl: number | null;
    avgInkCostPerMlMdl: number;
    inkStockMl: number;
    lfInkRetailMarkupMultiplier: number;
    lfInkDealerMarkupMultiplier: number;
    lfMinimumLineTotalMdl: number;
    bcMinimumLineTotalMdl: number;
    /** Purchase-cost basis; when false, profit hints compare sell without VAT. */
    purchaseCostsIncludeVat: boolean;
  };
  /** «Наклейки на листе»: tiers, margin, gap (`productionCosts.stickerSheet`, defaults in code). */
  stickerSheetSettings: StickerSheetSettings;
  /** «Открытки и карточки»: tiers, finishing rates, minimums (`productionCosts.postcard`, defaults in code). */
  postcardSettings: PostcardSettings;
  /** «Набор»: gift set templates (`AccountingSettings.giftSetTemplates`, defaults in code). */
  giftSetTemplates: GiftSetTemplate[];
  /** «Набор»: stock of each template box by SKU (staff; the set dialog shows it). Absent for dealers. */
  giftSetBoxStock?: Record<string, number>;
  /** «Набор»: stock item name of each template box by SKU (the set's box row). */
  giftSetBoxNames?: Record<string, string>;
  /** «Набор»: public photo URL of each template box by SKU (only boxes that have one). */
  giftSetBoxImages?: Record<string, string>;
}

export async function loadWizardBootstrap(): Promise<WizardBootstrapData> {
  const [mugRows, nbRows, penRows, lfRows, paperRows, acct, lfTank, dtfCatalog, uvCatalog, sublimationCatalog] =
    await Promise.all([
    // Mugs = variants of the unified «Кружки» category (all, like the other catalogs here).
    listMugVariants(prisma),
    // Notebooks = variants of the unified «Блокноты» category (all, like the other catalogs here).
    listNotebookVariants(prisma),
    // Pens = variants of the unified «Ручки» category (all, like the other catalogs here).
    prisma.stockVariant.findMany({
      where: PEN_VARIANT_WHERE,
      include: PEN_VARIANT_INCLUDE,
      orderBy: [...PEN_VARIANT_ORDER_BY],
    }),
    // Rolls and papers: pricing rows + balance / cost of their unified stock variants.
    findLfPricingMaterialsWithPresets(prisma),
    findSheetPapersPricing(prisma, { isActive: true }),
    getOrCreateAccountingSettings(),
    loadPrinterInkTank(prisma, DEFAULT_PRINT_PROCESS),
    loadDtfCatalog(),
    loadUvCatalog(),
    loadSublimationCatalog(),
  ]);

  const production = parseProductionCostsJson(acct.productionCosts);
  const giftSetTemplates = parseGiftSetTemplates(acct.giftSetTemplates);
  const boxSkus = [...new Set(giftSetTemplates.map((t) => t.boxSku).filter((s): s is string => Boolean(s)))];
  const boxRows = boxSkus.length
    ? await prisma.stockVariant.findMany({ where: { sku: { in: boxSkus } }, select: { sku: true, stockQuantity: true, item: { select: { nameRu: true, imageUrl: true } } } })
    : [];
  const printableMap = await lfMaterialPrintableWidthByIdsRaw(
    prisma,
    lfRows.map((r) => r.id),
  );

  return {
    mugProducts: mugRows.map(toAdminMugProductJson),
    notebookProducts: nbRows.map(toAdminNotebookProductJson),
    // `PenProductOption` is the picker's public shape, so it carries the
    // session-aware `displayPrice`/`priceTier` the `/api/pen-products` route
    // computes. Staff always see retail here — line pricing in the wizard is
    // overridable per row anyway.
    penProducts: penRows.map((v) => {
      const r = penVariantFields(v);
      return {
        id: r.id,
        sku: r.sku,
        nameRo: r.nameRo,
        nameRu: r.nameRu,
        nameEn: r.nameEn,
        imagePublicUrl: publicAssetUrlFromStorageKey(r.imageUrl),
        bodyColorHex: r.bodyColorHex,
        clipColorHex: r.clipColorHex,
        printWidthCm: r.printWidthCm,
        printHeightCm: r.printHeightCm,
        printDpi: r.printDpi,
        has3dPreview: r.has3dPreview,
        displayPrice: r.sellPrice,
        priceTier: "retail" as const,
        sellPrice: r.sellPrice,
      };
    }),
    lfMaterials: lfRows.map((r) => ({
      ...toAdminLargeFormatMaterialJson(r, production, r.sizePresets),
      printableWidthMeters: printableMap.get(r.id) ?? null,
    })),
    sheetPapers: paperRows.map(toAdminSheetPaperJson),
    dtfCatalog,
    uvCatalog,
    sublimationCatalog,
    printEconomics: {
      inkMlPerSqmLargeFormatRoll: production.inkMlPerSqmLargeFormatRoll,
      minimumOrderPriceMdl:
        typeof production.minimumOrderPriceMdl === "number"
          ? production.minimumOrderPriceMdl
          : null,
      avgInkCostPerMlMdl: lfTank.avgCostPerMl,
      inkStockMl: lfTank.stockMl,
      lfInkRetailMarkupMultiplier: production.lfInkRetailMarkupMultiplier ?? 0,
      lfInkDealerMarkupMultiplier: production.lfInkDealerMarkupMultiplier ?? 0,
      lfMinimumLineTotalMdl:
        typeof production.lfMinimumLineTotalMdl === "number"
          ? Math.max(0, Math.round(production.lfMinimumLineTotalMdl))
          : 0,
      bcMinimumLineTotalMdl: Math.max(
        0,
        Math.round(production.bcMinimumLineTotalMdl),
      ),
      purchaseCostsIncludeVat: acct.purchaseCostsIncludeVat,
    },
    stickerSheetSettings: parseStickerSheetSettings(
      (acct.productionCosts as Record<string, unknown> | null)?.stickerSheet,
    ),
    postcardSettings: parsePostcardSettings(
      (acct.productionCosts as Record<string, unknown> | null)?.postcard,
    ),
    giftSetTemplates,
    giftSetBoxStock: Object.fromEntries(boxRows.map((b) => [b.sku, Number(b.stockQuantity.toString())])),
    giftSetBoxNames: Object.fromEntries(boxRows.map((b) => [b.sku, b.item.nameRu])),
    giftSetBoxImages: Object.fromEntries(
      boxRows.flatMap((b) => {
        const url = publicAssetUrlFromStorageKey(b.item.imageUrl);
        return url ? [[b.sku, url] as const] : [];
      }),
    ),
  };
}
