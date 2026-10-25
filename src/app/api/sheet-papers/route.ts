import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMaybeCustomerUser } from "@/lib/auth";
import type { BusinessCardCustomerType } from "@/lib/businessCard/types";

/**
 * Customer-facing sheet paper catalog for business cards and flyers. Returns only active
 * papers with a single tier-correct sell rate per printed sheet — never the
 * purchase cost, stock balance or margin. Business-card ordering in the cabinet
 * is logged-in only, so an anonymous request is rejected.
 */
export async function GET() {
  const customer = await getMaybeCustomerUser();
  if (!customer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const customerType: BusinessCardCustomerType =
    customer.studioCustomer?.isDealer === true ? "dealer" : "retail";

  const rows = await prisma.sheetPaper.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      gsm: true,
      sheetWidthCm: true,
      sheetHeightCm: true,
      retailPricePerSheet: true,
      dealerPricePerSheet: true,
    },
  });

  const items = rows.map((r) => ({
    id: r.id,
    name: r.name,
    gsm: r.gsm,
    sheetWidthCm: Number(r.sheetWidthCm),
    sheetHeightCm: Number(r.sheetHeightCm),
    pricePerSheet:
      customerType === "dealer" ? r.dealerPricePerSheet : r.retailPricePerSheet,
  }));

  return NextResponse.json({ items, customerType });
}
