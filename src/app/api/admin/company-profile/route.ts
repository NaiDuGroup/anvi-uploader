import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isAdmin, isSuperAdmin } from "@/lib/roles";
import { companyProfileUpdateSchema } from "@/lib/validations";
import { isValidPersistedLogoPath } from "@/lib/companyLogoShared";
import {
  getOrCreateCompanyProfile,
  getShowPublicCabinetLoginCta,
  type SerializedCompanyProfile,
  toSerializableCompanyProfile,
} from "@/lib/invoice/companyProfile";

/** GET is allowed for admin + superadmin (read-only data shown on /admin/invoices). */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const profile = await getOrCreateCompanyProfile();
  const payload: SerializedCompanyProfile = toSerializableCompanyProfile(profile);
  payload.showPublicCabinetLoginCta = await getShowPublicCabinetLoginCta();
  return NextResponse.json({ profile: payload });
}

/** Mutating supplier identity is superadmin only. */
export async function PATCH(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(user.role)) {
    return NextResponse.json(
      { error: "Forbidden: superadmin only" },
      { status: 403 },
    );
  }

  try {
    const body = await request.json();
    const validated = companyProfileUpdateSchema.parse(body);
    if (
      validated.logoPath !== undefined &&
      !isValidPersistedLogoPath(validated.logoPath)
    ) {
      return NextResponse.json(
        { error: "Invalid logoPath" },
        { status: 400 },
      );
    }
    const existing = await getOrCreateCompanyProfile();

    const data: Prisma.CompanyProfileUpdateInput = {};
    if (validated.name !== undefined) data.name = validated.name.trim();
    if (validated.fiscalCode !== undefined) data.fiscalCode = validated.fiscalCode.trim();
    if (validated.address !== undefined) data.address = validated.address.trim();
    if (validated.iban !== undefined) data.iban = validated.iban.trim();
    if (validated.bankName !== undefined) data.bankName = validated.bankName.trim();
    if (validated.bic !== undefined) data.bic = validated.bic.trim();
    if (validated.directorName !== undefined) {
      data.directorName = validated.directorName?.trim() || null;
    }
    if (validated.accountantName !== undefined) {
      data.accountantName = validated.accountantName?.trim() || null;
    }
    if (validated.vatRate !== undefined) {
      data.vatRate = new Prisma.Decimal(validated.vatRate);
    }
    if (validated.invoiceNumberPadding !== undefined) {
      data.invoiceNumberPadding = validated.invoiceNumberPadding;
    }
    if (validated.invoiceValidityDays !== undefined) {
      data.invoiceValidityDays = validated.invoiceValidityDays;
    }
    if (validated.defaultLocale !== undefined) {
      data.defaultLocale = validated.defaultLocale;
    }
    if (validated.currency !== undefined) data.currency = validated.currency.trim();
    if (validated.logoPath !== undefined) {
      data.logoPath = validated.logoPath?.trim() || null;
    }

    // Do not pass `showPublicCabinetLoginCta` into prisma.companyProfile.update:
    // deployments with an outdated generated client throw "Unknown argument".
    const cabinetCtaFlag = validated.showPublicCabinetLoginCta;

    if (Object.keys(data).length > 0) {
      await prisma.companyProfile.update({
        where: { id: existing.id },
        data,
      });
    }

    if (cabinetCtaFlag !== undefined) {
      await prisma.$executeRaw`
        UPDATE company_profiles
        SET show_public_cabinet_login_cta = ${cabinetCtaFlag}
        WHERE id = ${existing.id}
      `;
    }

    const profileAfter = await prisma.companyProfile.findUnique({
      where: { id: existing.id },
    });
    if (!profileAfter) {
      return NextResponse.json(
        { error: "Company profile not found after update" },
        { status: 500 },
      );
    }

    const payload = toSerializableCompanyProfile(profileAfter);
    payload.showPublicCabinetLoginCta = await getShowPublicCabinetLoginCta();
    return NextResponse.json({ profile: payload });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.flatten() },
        { status: 400 },
      );
    }
    console.error("PATCH /api/admin/company-profile:", error);
    const dev = process.env.NODE_ENV === "development";
    const message =
      error instanceof Error ? error.message : "Failed to update settings";
    return NextResponse.json(
      { error: dev ? message : "Failed to update settings" },
      { status: 500 },
    );
  }
}
