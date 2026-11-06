/**
 * Progress of «Adaugă în coș» (Studio): the photo originals are uploaded,
 * the 300 dpi print file is drawn, then uploaded, then the line is saved.
 * Each stage owns a share of one bar, so it moves while the file is drawn
 * (that was ~10 s of a frozen «0%»). `pct` = bytes sent of the current
 * upload, null while none have moved yet. Pure.
 */

export type StudioCartStage = "photos" | "render" | "upload" | "save";

export interface StudioCartProgress {
  stage: StudioCartStage;
  /** Upload stages: share of the bytes sent (0–100), null until the first bytes move. */
  pct: number | null;
  /** Photos stage: photo `done` of `total`. */
  done?: number;
  total?: number;
}

/** Bar range of each stage (% of the whole). */
const RANGE: Record<StudioCartStage, [number, number]> = {
  photos: [0, 20],
  render: [20, 45],
  upload: [45, 95],
  save: [95, 100],
};

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}

/** Overall bar value (0–100) of a progress state. */
export function studioCartPercent(p: StudioCartProgress): number {
  const [a, b] = RANGE[p.stage];
  let share = 0;
  if (p.stage === "photos" && p.total && p.total > 0) share = ((p.done ?? 0) + clamp(p.pct ?? 0) / 100) / p.total;
  else if (p.stage === "upload") share = clamp(p.pct ?? 0) / 100;
  return Math.round(a + (b - a) * Math.max(0, Math.min(1, share)));
}

/** Which text the status line shows. */
export type StudioCartProgressText = "progressPhotos" | "preparing" | "progressUpload" | "progressSave";

export function studioCartProgressText(p: StudioCartProgress): StudioCartProgressText {
  if (p.stage === "photos") return "progressPhotos";
  if (p.stage === "render") return "preparing";
  if (p.stage === "upload") return "progressUpload";
  return "progressSave";
}
