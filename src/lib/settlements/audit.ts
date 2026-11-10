/**
 * «Взаиморасчёты → Журнал»: append-only log of who matched / changed what.
 * Writing never throws — a failed log entry must not fail the action itself.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AuditAction, AuditLogResponse } from "./auditTypes";

export { AUDIT_ACTIONS, isAuditAction, type AuditAction, type AuditLogDto, type AuditLogResponse } from "./auditTypes";

export interface AuditActor {
  id: string;
  name: string | null;
}

export interface AuditEntry {
  action: AuditAction;
  entityType?: string | null;
  entityId?: string | null;
  counterpartyIdno?: string | null;
  amount?: number | string | Prisma.Decimal | null;
  details?: Record<string, unknown> | null;
}

/** Session user → actor snapshot (display name preferred). */
export function actorOf(
  user: { id: string; name: string; displayName?: string | null } | null | undefined,
): AuditActor | null {
  if (!user) return null;
  return { id: user.id, name: user.displayName?.trim() || user.name };
}

type Db = typeof prisma | Prisma.TransactionClient;

export async function writeAudit(
  actor: AuditActor | null,
  entries: AuditEntry | readonly AuditEntry[],
  db: Db = prisma,
): Promise<void> {
  const list = Array.isArray(entries) ? entries : [entries as AuditEntry];
  if (list.length === 0) return;
  try {
    await db.reconciliationAuditLog.createMany({
      data: list.map((e) => ({
        userId: actor?.id ?? null,
        userName: actor?.name ?? null,
        action: e.action,
        entityType: e.entityType ?? null,
        entityId: e.entityId ?? null,
        counterpartyIdno: e.counterpartyIdno?.trim() || null,
        amount:
          e.amount == null || e.amount === ""
            ? null
            : new Prisma.Decimal(typeof e.amount === "number" ? e.amount.toFixed(2) : e.amount),
        details: e.details ? (e.details as Prisma.InputJsonValue) : Prisma.JsonNull,
      })),
    });
  } catch (error) {
    console.error("reconciliation audit log write failed:", error);
  }
}

export async function listAudit(filter: {
  idno?: string | null;
  action?: string | null;
  user?: string | null;
  page?: number;
  pageSize?: number;
}): Promise<AuditLogResponse> {
  const pageSize = Math.min(Math.max(filter.pageSize ?? 50, 1), 200);
  const page = Math.max(filter.page ?? 1, 1);
  const where: Prisma.ReconciliationAuditLogWhereInput = {};
  if (filter.idno) where.counterpartyIdno = filter.idno;
  if (filter.action) where.action = filter.action;
  if (filter.user === "auto") where.userId = null;
  else if (filter.user) where.userName = filter.user;
  const [rows, total, users] = await Promise.all([
    prisma.reconciliationAuditLog.findMany({
      where,
      orderBy: [{ at: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.reconciliationAuditLog.count({ where }),
    prisma.reconciliationAuditLog.findMany({
      where: { userName: { not: null } },
      distinct: ["userName"],
      select: { userName: true },
      take: 50,
    }),
  ]);
  return {
    entries: rows.map((r) => ({
      id: r.id,
      at: r.at.toISOString(),
      userName: r.userName,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      counterpartyIdno: r.counterpartyIdno,
      amount: r.amount == null ? null : Number(r.amount),
      details:
        r.details && typeof r.details === "object" && !Array.isArray(r.details)
          ? (r.details as Record<string, unknown>)
          : null,
    })),
    total,
    page,
    pageSize,
    users: users.map((u) => u.userName!).filter(Boolean).sort(),
  };
}
