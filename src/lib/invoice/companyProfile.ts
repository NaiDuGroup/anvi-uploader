import type { CompanyProfile } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Default supplier seeded with Anvi-Studio Group reqs (matches the reference
// "Cont spre plata" PDF). Used by getOrCreateCompanyProfile when the row is
// missing — keeps invoices working in any environment without forced reseed.
export const DEFAULT_COMPANY_PROFILE = {
  name: "ANVI-STUDIO GROUP SRL",
  fiscalCode: "1023600000396",
  address: "mun. Chișinău, str. Alba Iulia 77/18, of. 1",
  iban: "MD82AG000000022515244995",
  bankName: "BC MOLDOVA-AGROINDBANK S.A. suc. nr. 32 Chișinău",
  bic: "AGRNMD2X493",
  directorName: "Dunai Anatolie",
  accountantName: "Șișcanu Tatiana",
  vatRate: "20",
  invoiceCounter: 0,
  invoiceNumberPadding: 4,
  invoiceValidityDays: 5,
  defaultLocale: "ro",
  currency: "MDL",
  logoPath: "/logo.png" as string | null,
  showPublicCabinetLoginCta: true,
} as const;

/**
 * Returns the singleton CompanyProfile, creating it with sensible defaults
 * if no row exists yet. Safe to call from any API route.
 */
export async function getOrCreateCompanyProfile(): Promise<CompanyProfile> {
  const existing = await prisma.companyProfile.findFirst({
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;
  return prisma.companyProfile.create({
    data: { ...DEFAULT_COMPANY_PROFILE },
  });
}

/** Normalizes PostgreSQL / driver booleans from `$queryRaw`. */
function coercePgBool(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    if (["true", "t", "1", "yes"].includes(s)) return true;
    if (["false", "f", "0", "no"].includes(s)) return false;
  }
  return null;
}

/** Public landing pages read this (/, /mug, /notebook) for the cabinet-login CTA.
 *
 * Implemented with `$queryRaw` so it works even if the generated Prisma client is stale.
 */
export async function getShowPublicCabinetLoginCta(): Promise<boolean> {
  try {
    const rows = await prisma.$queryRaw<Array<{ show_public_cabinet_login_cta: unknown }>>`
      SELECT show_public_cabinet_login_cta
      FROM company_profiles
      ORDER BY created_at ASC
      LIMIT 1
    `;
    const v = coercePgBool(rows[0]?.show_public_cabinet_login_cta);
    return v ?? true;
  } catch {
    return true;
  }
}

/**
 * Plain-JSON shape of CompanyProfile for API responses. Decimal fields are
 * stringified to preserve precision on the wire and avoid surprises in JSON
 * (Prisma `Decimal` is a class instance).
 */
export interface SerializedCompanyProfile {
  id: string;
  name: string;
  fiscalCode: string;
  address: string;
  iban: string;
  bankName: string;
  bic: string;
  directorName: string | null;
  accountantName: string | null;
  vatRate: string;
  invoiceCounter: number;
  invoiceNumberPadding: number;
  invoiceValidityDays: number;
  defaultLocale: string;
  currency: string;
  logoPath: string | null;
  showPublicCabinetLoginCta: boolean;
  createdAt: string;
  updatedAt: string;
}

export function toSerializableCompanyProfile(
  p: CompanyProfile,
): SerializedCompanyProfile {
  return {
    id: p.id,
    name: p.name,
    fiscalCode: p.fiscalCode,
    address: p.address,
    iban: p.iban,
    bankName: p.bankName,
    bic: p.bic,
    directorName: p.directorName ?? null,
    accountantName: p.accountantName ?? null,
    vatRate: p.vatRate.toString(),
    invoiceCounter: p.invoiceCounter,
    invoiceNumberPadding: p.invoiceNumberPadding,
    invoiceValidityDays: p.invoiceValidityDays,
    defaultLocale: p.defaultLocale,
    currency: p.currency,
    logoPath: p.logoPath ?? null,
    showPublicCabinetLoginCta: p.showPublicCabinetLoginCta,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

/**
 * Renders the displayed invoice number from a sequence integer using the
 * profile's padding (e.g. 306 with padding=4 → "0306"). Used both at ISSUE
 * time and from tests.
 */
export function formatInvoiceNumber(seq: number, padding: number): string {
  if (!Number.isFinite(seq) || seq < 1) {
    throw new Error(`formatInvoiceNumber: invalid sequence ${seq}`);
  }
  return String(seq).padStart(Math.max(1, padding), "0");
}
