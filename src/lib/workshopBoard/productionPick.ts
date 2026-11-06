import { isLineHeldForLayout } from "@/lib/layoutIssue";
import type { WorkshopBoardLine } from "./types";

/**
 * Which board lines a production step may pick. «Нужен макет» lines
 * (`isLineHeldForLayout`) are never picked: the mug / notebook batches
 * (status snapshots in `mugBatchFromSection` / `notebookBatchFromSection`),
 * the DTF / UV-DTF film (`filmLineChoices`, `pickFilmLines`), the LF roll
 * planner (here) and the business-card sheet (`canDownloadSheetLayout`).
 * The server refuses them too (`line_needs_layout`).
 */

/** Large-format lines the roll planner lays out. */
export function lfPlannerLines<T extends Pick<WorkshopBoardLine, "facts" | "lineStatus">>(lines: readonly T[]): T[] {
  return lines.filter((l) => l.facts.kind === "lf" && !isLineHeldForLayout(l));
}

/** Lines of a group held for a new layout (the planner / film show «N ждут макет»). */
export function heldForLayoutCount(lines: readonly Pick<WorkshopBoardLine, "lineStatus">[]): number {
  return lines.filter((l) => isLineHeldForLayout(l)).length;
}

/** Business-card / flyer «Скачать макет» is allowed (the line is not waiting for a new file). */
export function canDownloadSheetLayout(line: Pick<WorkshopBoardLine, "lineStatus">): boolean {
  return !isLineHeldForLayout(line);
}
