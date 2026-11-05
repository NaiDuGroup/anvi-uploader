import { getOrCreateCompanyProfile } from "@/lib/invoice/companyProfile";
import { resolveStudioInfo } from "@/lib/studioInfo/studioInfo";

/**
 * Studio address shown to the client under «Готов — забрать в студии»
 * (studio info edited in Settings → «Контакты и подвал кабинета»); null when empty.
 * There is no separate workshop address in the settings yet.
 */
export async function getStudioPickupAddress(): Promise<string | null> {
  const profile = await getOrCreateCompanyProfile();
  return resolveStudioInfo(profile.studioInfo).address.trim() || null;
}
