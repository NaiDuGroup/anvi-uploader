import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { invalidateAccountingSettings } from "@/lib/accounting/accountingSettings";
import { DtfAccess, dtfRouteError, readJsonBody, requireDtfUser } from "@/lib/dtf/dtfRoute";
import { dtfSettingsSchema, parseDtfSettingsJson } from "@/lib/dtf/dtfSettings";
import { loadDtfSettings } from "@/lib/dtf/resolveDtfLine";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await requireDtfUser(DtfAccess.Read);
  if (user instanceof NextResponse) return user;
  try {
    return NextResponse.json({ settings: await loadDtfSettings() });
  } catch (error) {
    return dtfRouteError(error, "settings read");
  }
}

export async function PATCH(request: NextRequest) {
  const user = await requireDtfUser(DtfAccess.Manage);
  if (user instanceof NextResponse) return user;
  try {
    const input = dtfSettingsSchema.parse(await readJsonBody(request));
    const settings = parseDtfSettingsJson(input);
    const json = settings as unknown as Prisma.InputJsonValue;
    await prisma.accountingSettings.upsert({
      where: { id: "default" },
      create: { id: "default", productionCosts: {}, dtfSettings: json },
      update: { dtfSettings: json },
    });
    invalidateAccountingSettings();
    return NextResponse.json({ settings });
  } catch (error) {
    return dtfRouteError(error, "settings update");
  }
}
