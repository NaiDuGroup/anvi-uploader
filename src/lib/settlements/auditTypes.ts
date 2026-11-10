/** «Журнал» action codes and DTOs (no Prisma — safe for client components). */

export const AUDIT_ACTIONS = [
  "match",
  "unmatch",
  "auto_match",
  "auto_confirm",
  "supplier_auto_match",
  "confirm",
  "reject",
  "unconfirm",
  "manual_allocate",
  "category_set",
  "card_alias_set",
  "opening_balance_set",
  "opening_balance_removed",
  "check_dismissed",
  "check_restored",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export function isAuditAction(v: unknown): v is AuditAction {
  return typeof v === "string" && (AUDIT_ACTIONS as readonly string[]).includes(v);
}

export interface AuditLogDto {
  id: string;
  at: string;
  userName: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  counterpartyIdno: string | null;
  amount: number | null;
  details: Record<string, unknown> | null;
}

export interface AuditLogResponse {
  entries: AuditLogDto[];
  total: number;
  page: number;
  pageSize: number;
  /** Distinct user names for the filter. */
  users: string[];
}
