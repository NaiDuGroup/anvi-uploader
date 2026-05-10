import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isAdmin, isSuperAdmin } from "@/lib/roles";
import { companyProfileUpdateSchema } from "@/lib/validations";
import {
  getOrCreateCompanyProfile,
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

    const updated = await prisma.companyProfile.update({
      where: { id: existing.id },
      data,
    });

    return NextResponse.json({ profile: toSerializableCompanyProfile(updated) });
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
