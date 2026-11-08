import { prisma } from "./prisma";

/**
 * Builds a name lookup for order actors (createdBy / sentToWorkshopBy / assignedTo).
 *
 * `getStaffUsersMap()` holds staff only, so an order created or sent by a dealer
 * or cabinet customer would show no name. Ids missing from the staff map are
 * looked up in one small query.
 */
export async function buildActorNameResolver(
  staffMap: Map<string, string>,
  ids: Iterable<string | null | undefined>,
): Promise<(id: string | null | undefined) => string | null> {
  const missing = new Set<string>();
  for (const id of ids) {
    if (id && !staffMap.has(id)) missing.add(id);
  }
  const extra = new Map<string, string>();
  if (missing.size > 0) {
    const rows = await prisma.user.findMany({
      where: { id: { in: [...missing] } },
      select: { id: true, name: true, displayName: true },
    });
    for (const u of rows) extra.set(u.id, u.displayName ?? u.name);
  }
  return (id) => (id ? staffMap.get(id) ?? extra.get(id) ?? null : null);
}
