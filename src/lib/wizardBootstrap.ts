import "server-only";
import { prisma } from "./prisma";
import { toAdminMugProductJson } from "./mug/toAdminMugProductJson";
import { toAdminNotebookProductJson } from "./notebook/toAdminNotebookProductJson";
import {
  toAdminLargeFormatMaterialJson,
  type AdminLargeFormatMaterialJson,
} from "./largeFormat/toAdminLargeFormatMaterialJson";
import { lfMaterialPrintableWidthByIdsRaw } from "./largeFormat/lfMaterialPrintableWidthSql";
import { getOrCreateAccountingSettings } from "./accounting/accountingSettings";
import { parseProductionCostsJson } from "./accounting/types";
import { getOrCreateInkInventory } from "./ink/inkInventory";
import { DEFAULT_PRINT_PROCESS } from "./printProcess";
import type { MugProductOption } from "@/app/mug/_components/MugProductPicker";
import type { NotebookProductOption } from "@/app/notebook/_components/NotebookProductPicker";

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
  lfMaterials: AdminLargeFormatMaterialJson[];
  printEconomics: {
    inkMlPerSqmLargeFormatRoll: number;
    minimumOrderPriceMdl: number | null;
    avgInkCostPerMlMdl: number;
    inkStockMl: number;
    lfInkRetailMarkupMultiplier: number;
    lfInkDealerMarkupMultiplier: number;
    lfMinimumLineTotalMdl: number;
  };
}

export async function loadWizardBootstrap(): Promise<WizardBootstrapData> {
  const [mugRows, nbRows, lfRows, acct, lfTank] = await Promise.all([
    prisma.mugProduct.findMany({
      orderBy: [{ sortOrder: "asc" }, { sku: "asc" }],
    }),
    prisma.notebookProduct.findMany({
      orderBy: [{ sortOrder: "asc" }, { sku: "asc" }],
    }),
    prisma.largeFormatMaterial.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    getOrCreateAccountingSettings(),
    getOrCreateInkInventory(prisma, DEFAULT_PRINT_PROCESS),
  ]);

  const production = parseProductionCostsJson(acct.productionCosts);
  const printableMap = await lfMaterialPrintableWidthByIdsRaw(
    prisma,
    lfRows.map((r) => r.id),
  );

  return {
    mugProducts: mugRows.map(toAdminMugProductJson),
    notebookProducts: nbRows.map(toAdminNotebookProductJson),
    lfMaterials: lfRows.map((r) => ({
      ...toAdminLargeFormatMaterialJson(r, production),
      printableWidthMeters: printableMap.get(r.id) ?? null,
    })),
    printEconomics: {
      inkMlPerSqmLargeFormatRoll: production.inkMlPerSqmLargeFormatRoll,
      minimumOrderPriceMdl:
        typeof production.minimumOrderPriceMdl === "number"
          ? production.minimumOrderPriceMdl
          : null,
      avgInkCostPerMlMdl: Number(lfTank.avgCostPerMl),
      inkStockMl: Number(lfTank.stockMl),
      lfInkRetailMarkupMultiplier: production.lfInkRetailMarkupMultiplier ?? 0,
      lfInkDealerMarkupMultiplier: production.lfInkDealerMarkupMultiplier ?? 0,
      lfMinimumLineTotalMdl:
        typeof production.lfMinimumLineTotalMdl === "number"
          ? Math.max(0, Math.round(production.lfMinimumLineTotalMdl))
          : 0,
    },
  };
}
