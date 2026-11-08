import { isSuperAdmin } from "@/lib/roles";

/**
 * «Сайт» admin section (report, promo codes, company requests): super admin only —
 * not studio admin, workshop or customers.
 */
export function canViewShopAdmin(role: string): boolean {
  return isSuperAdmin(role);
}
