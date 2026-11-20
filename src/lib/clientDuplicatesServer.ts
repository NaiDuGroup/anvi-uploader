import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  normalizeIdno,
  phoneMatchKey,
  pickDuplicateClient,
  type DuplicateClientMatch,
} from "@/lib/clientDuplicates";

const CANDIDATE_SELECT = {
  id: true,
  kind: true,
  companyName: true,
  personName: true,
  phone: true,
  phoneNormalized: true,
  companyIdno: true,
  isDealer: true,
} satisfies Prisma.StudioCustomerSelect;

/**
 * Existing client with the same IDNO (digits compared, spaces / dashes ignored)
 * or the same phone (local part, any client kind). `excludeId` = the client
 * being edited. No DB unique constraint exists (prod may already hold dupes),
 * so create / edit routes call this before writing.
 */
export async function findDuplicateClient(input: {
  phoneNormalized?: string | null;
  companyIdno?: string | null;
  excludeId?: string | null;
}): Promise<DuplicateClientMatch | null> {
  const idno = normalizeIdno(input.companyIdno);
  const phone = phoneMatchKey(input.phoneNormalized);
  const or: Prisma.StudioCustomerWhereInput[] = [];
  // IDNOs are stored as typed: a few hundred legal clients, so compare digits in JS
  // instead of guessing every spacing in SQL.
  if (idno) or.push({ companyIdno: { not: null } });
  if (phone) or.push({ phoneNormalized: { endsWith: phone } });
  if (or.length === 0) return null;

  const candidates = await prisma.studioCustomer.findMany({
    where: {
      OR: or,
      ...(input.excludeId ? { NOT: { id: input.excludeId } } : {}),
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: CANDIDATE_SELECT,
  });
  return pickDuplicateClient(candidates, input);
}

/** Body of the 409 response the client form understands. */
export function duplicateClientResponseBody(match: DuplicateClientMatch) {
  return { error: "duplicate_client" as const, field: match.field, existing: match.existing };
}
