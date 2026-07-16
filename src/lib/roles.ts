/** Studio admin + workshop (full studio parity) + superadmin. */
const ADMIN_ROLES = new Set(["admin", "superadmin", "workshop"]);

export function isAdmin(role: string): boolean {
  return ADMIN_ROLES.has(role);
}

export function isSuperAdmin(role: string): boolean {
  return role === "superadmin";
}

/** Physical mug SKU catalog: workshop + super admin only (not studio «admin»). */
export function canManageMugCatalog(role: string): boolean {
  return role === "workshop" || role === "superadmin";
}

/**
 * Read-only list of large-format roll materials (order wizard + catalog screens).
 * Studio `admin` needs this for LF orders; POST/PATCH/DELETE stay `canManageMugCatalog`-only where applicable.
 */
export function canListLargeFormatMaterials(role: string): boolean {
  return isAdmin(role) || canManageMugCatalog(role);
}

/** Physical notebook SKU catalog: workshop + super admin only (not studio «admin»). */
export function canManageNotebookCatalog(role: string): boolean {
  return role === "workshop" || role === "superadmin";
}

/**
 * True when the account's stored role string is `workshop` (badge / nav chrome).
 * Capability checks should use `isAdmin` — workshop has studio-admin parity.
 */
export function isWorkshopOnly(role: string): boolean {
  return role === "workshop";
}

/** Customer-portal account (role lives on the same `users` table). */
export function isCustomer(role: string): boolean {
  return role === "customer";
}
