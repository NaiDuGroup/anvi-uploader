/**
 * Server + client helper: derive the 7-day expiry timestamp for a workshop
 * batch layout based on its `createdAt`. Mirrors {@link ORDER_FILE_LIFECYCLE_DAYS}
 * but keys off the DB row rather than the object key (our storage keys have
 * a nested `uploads/workshop-batches/` prefix, so {@link parseOrderFileUploadedAt}
 * cannot parse the timestamp — see plan for rationale).
 */
import {
  ORDER_FILE_LIFECYCLE_DAYS,
  computeLifecycleStatus,
  type LifecycleStatus,
} from "@/lib/orderFileLifecycle";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** `createdAt + 7 days` — the moment the R2 lifecycle rule will delete the object. */
export function workshopBatchExpiryAt(createdAt: Date): Date {
  return new Date(
    createdAt.getTime() + ORDER_FILE_LIFECYCLE_DAYS * ONE_DAY_MS,
  );
}

export function workshopBatchLifecycleStatus(
  createdAt: Date,
  now: Date = new Date(),
): LifecycleStatus {
  return computeLifecycleStatus(workshopBatchExpiryAt(createdAt), now);
}
