import { isBoardSectionKey, type BoardSectionKey } from "./types";

/**
 * Reads the board's saved section filter. `current` is the comma list stored
 * under the current key; `legacy` the one saved before UV-DTF got its own
 * section, where «uv_print» meant UV print and UV-DTF stickers together —
 * so it keeps showing both.
 */
export function parseSavedBoardSections(current: string | null, legacy: string | null): BoardSectionKey[] {
  if (current !== null) return current.split(",").filter(isBoardSectionKey);
  if (!legacy) return [];
  const keys = legacy.split(",").filter(isBoardSectionKey);
  if (keys.includes("uv_print") && !keys.includes("uv_dtf")) keys.push("uv_dtf");
  return keys;
}
