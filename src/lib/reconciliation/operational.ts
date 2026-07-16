import { prisma } from "@/lib/prisma";

/**
 * Built-in operational counterparties (card acquiring settlements, etc.).
 * These CREDITS are daily terminal income, not client e-Factura payments.
 */
export const DEFAULT_OPERATIONAL_IDNOS = [
  "1002600003778", // BC 'MAIB' S.A. — terminal acquiring settlement
] as const;

const DEFAULT_SET = new Set<string>(DEFAULT_OPERATIONAL_IDNOS);

export function isDefaultOperationalIdno(
  idno: string | null | undefined,
): boolean {
  return !!idno && DEFAULT_SET.has(idno.trim());
}

/** Defaults + admin-added rows from `reconciliation_exclusions`. */
export async function loadOperationalIdnos(): Promise<Set<string>> {
  const set = new Set<string>(DEFAULT_OPERATIONAL_IDNOS);
  try {
    const rows = await prisma.reconciliationExclusion.findMany({
      select: { idno: true },
    });
    for (const r of rows) {
      if (r.idno.trim()) set.add(r.idno.trim());
    }
  } catch {
    // Table missing / stale client — defaults still apply.
  }
  return set;
}

export function isOperationalIdno(
  idno: string | null | undefined,
  operationalSet: Set<string>,
): boolean {
  return !!idno && operationalSet.has(idno.trim());
}

/**
 * Marks unmatched/suggested CREDIT txs from operational counterparties as
 * IGNORED so they leave the reconciliation queue. Idempotent.
 */
export async function markOperationalCreditsIgnored(options?: {
  statementId?: string;
}): Promise<number> {
  const idnos = [...(await loadOperationalIdnos())];
  if (idnos.length === 0) return 0;
  const result = await prisma.bankTransaction.updateMany({
    where: {
      direction: "CREDIT",
      counterpartyIdno: { in: idnos },
      matchStatus: { in: ["UNMATCHED", "SUGGESTED"] },
      ...(options?.statementId ? { statementId: options.statementId } : {}),
    },
    data: { matchStatus: "IGNORED" },
  });
  return result.count;
}
