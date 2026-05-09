const ADMIN_ROLES = new Set(["admin", "superadmin"]);

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
