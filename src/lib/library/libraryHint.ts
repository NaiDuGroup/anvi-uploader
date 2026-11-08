/**
 * «Сохранить макеты в библиотеку?» after an order is made / handed over.
 * Pure (client-safe, unit-tested).
 */
import { isLibraryKey } from "./libraryKeys";

/** Statuses that end the work on an order: ready in the studio / workshop, back in the studio, delivered. */
export const LIBRARY_HINT_STATUSES: ReadonlySet<string> = new Set([
  "READY_IN_STUDIO",
  "WORKSHOP_READY",
  "RETURNED_TO_STUDIO",
  "DELIVERED",
]);

/** Order files that could still go to the library: stored uploads (not links, not library keys themselves). */
export function libraryHintCandidateIds(files: ReadonlyArray<{ id: string; fileUrl: string }>): string[] {
  return files.filter((f) => !/^https?:\/\//i.test(f.fileUrl) && !isLibraryKey(f.fileUrl)).map((f) => f.id);
}

/** How many candidates are neither in the library nor in its archive (archived ones are restored, not re-saved). */
export function libraryHintMissingCount(
  candidateIds: readonly string[],
  status: { inLibrary?: Record<string, string>; archived?: Record<string, string> },
): number {
  return candidateIds.filter((id) => !status.inLibrary?.[id] && !status.archived?.[id]).length;
}
