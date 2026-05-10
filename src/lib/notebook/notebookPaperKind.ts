import { z } from "zod";

/**
 * Paper layout inside the notebook. Frozen on the catalog SKU and copied into
 * the per-order snapshot at order creation, so historical orders preserve the
 * original type even if the catalog row is later edited.
 */
export const NOTEBOOK_PAPER_KINDS = ["ruled", "squared", "dated"] as const;

export type NotebookPaperKind = (typeof NOTEBOOK_PAPER_KINDS)[number];

export const NOTEBOOK_PAPER_KIND_DEFAULT: NotebookPaperKind = "ruled";

export const notebookPaperKindZod = z.enum(NOTEBOOK_PAPER_KINDS);

export function isNotebookPaperKind(v: unknown): v is NotebookPaperKind {
  return (
    typeof v === "string" &&
    (NOTEBOOK_PAPER_KINDS as readonly string[]).includes(v)
  );
}

/**
 * Coerce any unknown value to a valid `NotebookPaperKind`, falling back to the
 * default. Useful when reading legacy snapshots that may not have the field.
 */
export function coerceNotebookPaperKind(v: unknown): NotebookPaperKind {
  return isNotebookPaperKind(v) ? v : NOTEBOOK_PAPER_KIND_DEFAULT;
}
