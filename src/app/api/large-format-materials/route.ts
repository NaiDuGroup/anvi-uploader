import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMaybeCustomerUser } from "@/lib/auth";
import { getOrCreateAccountingSettings } from "@/lib/accounting/accountingSettings";
import { parseProductionCostsJson } from "@/lib/accounting/types";
import { effectiveLfMaterialCostPerLinearMeterMdl } from "@/lib/largeFormat/lfRollOrderEconomics";
import { resolveLfSellRatesPerLinearMeterMdl } from "@/lib/largeFormat/lfResolveSellRates";
import { selectLfSizePresetPriceMdl } from "@/lib/largeFormat/lfPresetPricing";
import { resolveEffectivePrintableWidthMeters } from "@/lib/largeFormat/largeFormatRollConstants";
import type { LargeFormatCustomerType } from "@/lib/largeFormat/types";

/**
 * Customer-facing large-format roll catalog. Returns only active materials and
 * exposes a single tier-correct sell rate (retail vs dealer) plus size presets
 * with the tier price — never raw cost / margin fields. Large-format ordering in
 * the cabinet is logged-in only, so an anonymous request is rejected.
 *
 * Printable width is derived the same way the server pricing pipeline does
 * (`resolveEffectivePrintableWidthMeters`) so the client roll-pack preview
 * matches the authoritative packing used at order time.
 */
export async function GET() {
  const customer = await getMaybeCustomerUser();
  if (!customer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const customerType: LargeFormatCustomerType =
    customer.studioCustomer?.isDealer === true ? "dealer" : "retail";

  const acct = await getOrCreateAccountingSettings();
  const production = parseProductionCostsJson(acct.productionCosts);

  const rows = await prisma.largeFormatMaterial.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { sizePresets: true },
  });

  const items = rows.map((r) => {
    const effLm = effectiveLfMaterialCostPerLinearMeterMdl(r);
    const sell = resolveLfSellRatesPerLinearMeterMdl({
      effectiveMaterialCostPerLinearMeterMdl: effLm,
      production,
      material: r,
    });
    const sellPricePerLinearMeter =
      customerType === "dealer"
        ? sell.finalDealerPricePerLinearMeter
        : sell.finalRetailPricePerLinearMeter;

    const printableWidthMeters = resolveEffectivePrintableWidthMeters({
      printableWidthMeters: r.printableWidthMeters?.toString() ?? null,
      rollWidthMeters: r.rollWidthMeters.toString(),
    });

    return {
      id: r.id,
      name: r.name,
      rollWidthMeters: Number(r.rollWidthMeters),
      printableWidthMeters,
      sellPricePerLinearMeter,
      sizePresets: r.sizePresets
        .filter((p) => p.isActive)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((p) => ({
          id: p.id,
          widthCm: p.widthCm,
          heightCm: p.heightCm,
          priceMdl: selectLfSizePresetPriceMdl(p, customerType),
        })),
    };
  });

  return NextResponse.json({ items, customerType });
}
