import { getClientVisibleStatus, type ClientVisibleStatus } from "@/lib/validations";

export type CabinetStatusStep = { status: ClientVisibleStatus; at: string };

/**
 * Status history as the customer may see it: the creation moment plus every
 * staff status change mapped to the client-visible status, with consecutive
 * repeats collapsed (NEW → IN_PROGRESS → SENT_TO_WORKSHOP are all "in
 * progress"). Only the status and the time leave the server — never who
 * changed it or the internal status name.
 */
export function toCabinetStatusTimeline(
  createdAt: Date,
  changes: readonly { newValue: string | null; createdAt: Date }[],
): CabinetStatusStep[] {
  const steps: CabinetStatusStep[] = [
    { status: "inProgress", at: createdAt.toISOString() },
  ];
  const sorted = [...changes].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  for (const c of sorted) {
    if (!c.newValue) continue;
    const status = getClientVisibleStatus(c.newValue);
    if (steps[steps.length - 1].status === status) continue;
    steps.push({ status, at: c.createdAt.toISOString() });
  }
  return steps;
}
