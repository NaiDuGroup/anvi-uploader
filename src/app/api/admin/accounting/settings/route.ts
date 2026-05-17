import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getOrCreateAccountingSettings } from "@/lib/accounting/accountingSettings";
import {
  accountingProductionSettingsPatchSchema,
} from "@/lib/validations";
import { parseProductionCostsJson } from "@/lib/accounting/types";
import { getOrCreateCompanyProfile } from "@/lib/invoice/companyProfile";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSuperAdmin(user.role)) {
    return NextResponse.json(
      { error: "Forbidden: superadmin only" },
      { status: 403 },
    );
  }

  const row = await getOrCreateAccountingSettings();
  const productionCosts = parseProductionCostsJson(row.productionCosts);
  const company = await getOrCreateCompanyProfile();
  return NextResponse.json({
    productionCosts,
    currency: company.currency,
    updatedAt: row.updatedAt.toISOString(),
  });
}

export async function PATCH(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSuperAdmin(user.role)) {
    return NextResponse.json(
      { error: "Forbidden: superadmin only" },
      { status: 403 },
    );
  }

  try {
    const raw = (await request.json()) as unknown;
    const body = accountingProductionSettingsPatchSchema.parse(raw);
    const updated = await prisma.accountingSettings.upsert({
      where: { id: "default" },
      create: { id: "default", productionCosts: body as object },
      update: { productionCosts: body as object },
    });
    const company = await getOrCreateCompanyProfile();
    return NextResponse.json({
      productionCosts: parseProductionCostsJson(updated.productionCosts),
      currency: company.currency,
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: e.flatten() },
        { status: 400 },
      );
    }
    console.error("PATCH /api/admin/accounting/settings:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
