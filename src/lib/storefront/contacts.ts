import "server-only";
import { getOrCreateCompanyProfile } from "@/lib/invoice/companyProfile";
import { DEFAULT_STUDIO_INFO, resolveStudioInfo, type StudioContact } from "@/lib/studioInfo/studioInfo";

export interface ShopContacts {
  companyName: string;
  address: string;
  mainPhone: string;
  wholesale: StudioContact[];
  mapUrl: string;
}

/** Public studio card (Settings → studio info) for the shop footer and «Pentru companii». */
export async function loadShopContacts(): Promise<ShopContacts> {
  let info = DEFAULT_STUDIO_INFO;
  try {
    const profile = await getOrCreateCompanyProfile();
    info = resolveStudioInfo(profile.studioInfo);
  } catch (error) {
    console.error("[shop] studio info failed:", error);
  }
  const wholesale = info.contacts.filter((c) => c.purpose === "wholesale");
  return {
    companyName: "ANVI-STUDIO GROUP SRL",
    address: info.address,
    mainPhone: info.mainPhone,
    wholesale: wholesale.length ? wholesale : info.contacts.slice(0, 2),
    mapUrl: info.mapUrl,
  };
}
