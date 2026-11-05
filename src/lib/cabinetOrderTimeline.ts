import { getClientVisibleStatus, type ClientVisibleStatus } from "@/lib/validations";

export type CabinetStatusStep = {
  status: ClientVisibleStatus;
  at: string;
  /** Set on a «ready at the studio» step reached from the workshop: shown as «Перевезён из цеха в студию». */
  movedFromWorkshop?: true;
};

/** The order came back from the workshop to the studio (`prev` → `next` internal statuses). */
function isMoveFromWorkshop(prev: string, next: string): boolean {
  if (next === "RETURNED_TO_STUDIO") return true;
  return next === "READY_IN_STUDIO" && prev === "WORKSHOP_READY";
}

/**
 * Status history as the customer may see it: the creation moment plus every
 * staff status change mapped to the client-visible status, with consecutive
 * repeats collapsed (NEW → IN_PROGRESS are both «accepted»). Only the status
 * and the time leave the server — never who changed it or the internal status name.
 */
export function toCabinetStatusTimeline(
  createdAt: Date,
  changes: readonly { oldValue?: string | null; newValue: string | null; createdAt: Date }[],
  /** Current `Order.status`: the starting status when there is no change yet. */
  currentStatus?: string,
): CabinetStatusStep[] {
  const sorted = [...changes].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  // Orders may be created straight in a later status (dealer cabinet orders
  // start «SENT_TO_WORKSHOP»): the first change's old value, or the current
  // status when nothing changed yet, is where the order started.
  const initial = sorted.find((c) => c.newValue)?.oldValue || (sorted.length === 0 ? currentStatus : null) || "NEW";
  const steps: CabinetStatusStep[] = [
    { status: getClientVisibleStatus(initial), at: createdAt.toISOString() },
  ];
  let prevInternal = initial;
  for (const c of sorted) {
    if (!c.newValue) continue;
    const status = getClientVisibleStatus(c.newValue);
    const moved = isMoveFromWorkshop(prevInternal, c.newValue);
    prevInternal = c.newValue;
    if (steps[steps.length - 1].status === status) continue;
    steps.push(
      moved
        ? { status, at: c.createdAt.toISOString(), movedFromWorkshop: true }
        : { status, at: c.createdAt.toISOString() },
    );
  }
  return steps;
}
