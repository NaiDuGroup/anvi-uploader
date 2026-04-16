const ADMIN_ROLES = new Set(["admin", "superadmin"]);

export function isAdmin(role: string): boolean {
  return ADMIN_ROLES.has(role);
}

export function isSuperAdmin(role: string): boolean {
  return role === "superadmin";
}
