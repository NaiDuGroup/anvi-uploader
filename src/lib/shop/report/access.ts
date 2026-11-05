/** «Сайт» admin section (report, promo codes): studio admin + superadmin, not workshop or customers. */
export function canViewShopAdmin(role: string): boolean {
  return role === "admin" || role === "superadmin";
}
