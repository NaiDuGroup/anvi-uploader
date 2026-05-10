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

/** Physical notebook SKU catalog: workshop + super admin only (not studio «admin»). */
export function canManageNotebookCatalog(role: string): boolean {
  return role === "workshop" || role === "superadmin";
}

/**
 * Workshop role: print-floor operator. Cannot create new client orders.
 * Used to gate the "+ New Order" entry point and `/admin/orders/new` page.
 */
export function isWorkshopOnly(role: string): boolean {
  return role === "workshop";
}

/** Customer-portal account (role lives on the same `users` table). */
export function isCustomer(role: string): boolean {
  return role === "customer";
}
