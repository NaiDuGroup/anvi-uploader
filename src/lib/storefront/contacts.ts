import "server-only";
import { getOrCreateCompanyProfile } from "@/lib/invoice/companyProfile";
import { DEFAULT_STUDIO_INFO, resolveStudioInfo, type StudioContact } from "@/lib/studioInfo/studioInfo";
import type { WeekHours } from "@/lib/studioInfo/studioHours";

export interface ShopContacts {
  companyName: string;
  /** IDNO (`CompanyProfile.fiscalCode`), when stored. */
  idno: string | null;
  /** Legal address of the company (invoices), when stored. */
  legalAddress: string | null;
  /** Studio (pickup) address. */
  address: string;
  mainPhone: string;
  /** Public e-mail (Settings → studio info), null when not set. */
  email: string | null;
  wholesale: StudioContact[];
  mapUrl: string;
  hours: WeekHours;
}

/** Public studio card (Settings → studio info) + company details for the shop footer, pickup and «Pentru companii». */
export async function loadShopContacts(): Promise<ShopContacts> {
  let info = DEFAULT_STUDIO_INFO;
  let idno: string | null = null;
  let legalAddress: string | null = null;
  let companyName = "ANVI-STUDIO GROUP SRL";
  try {
    const profile = await getOrCreateCompanyProfile();
    info = resolveStudioInfo(profile.studioInfo);
    idno = profile.fiscalCode?.trim() || null;
    legalAddress = profile.address?.trim() || null;
    companyName = profile.name?.trim() || companyName;
  } catch (error) {
    console.error("[shop] studio info failed:", error);
  }
  const wholesale = info.contacts.filter((c) => c.purpose === "wholesale");
  return {
    companyName,
    idno,
    legalAddress,
    address: info.address,
    mainPhone: info.mainPhone,
    email: info.email?.trim() || null,
    wholesale: wholesale.length ? wholesale : info.contacts.slice(0, 2),
    mapUrl: info.mapUrl,
    hours: info.hours,
  };
}
