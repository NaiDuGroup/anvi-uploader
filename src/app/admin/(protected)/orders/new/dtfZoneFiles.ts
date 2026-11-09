import { dtfZoneFilePaperType, dtfZoneIdFromPaperType } from "@/lib/dtf/dtfConstants";
import type { WizardReusedFile } from "@/app/admin/_components/library/wizardReuse";

/**
 * Artwork of one more DTF zone on a wizard row (front + back on one T-shirt).
 * The row's own file prints in the row zone; every other zone may carry its
 * file here, so the line is one garment with several prints instead of one
 * T-shirt per file. Same three sources as a business-card reverse.
 */
export interface WizardDtfZoneFile {
  /** Fresh upload. */
  file?: File;
  /** Edit mode: file already stored on the order. */
  existing?: { id: string; fileName: string; paperType: string | null };
  /** «Повторить заказ» / library: stored key reused as is. */
  reuse?: WizardReusedFile;
}

/** Zone id → its artwork. */
export type WizardDtfZoneFiles = Record<string, WizardDtfZoneFile>;

export function dtfZoneFileHasArtwork(e: WizardDtfZoneFile | null | undefined): boolean {
  return Boolean(e && (e.file || e.existing || e.reuse));
}

export function dtfZoneFileName(e: WizardDtfZoneFile | null | undefined): string | null {
  return e?.file?.name ?? e?.existing?.fileName ?? e?.reuse?.fileName ?? null;
}

/**
 * Zone the row's own file prints in: the row's chosen zone, else the zone the
 * stored file is tagged to, else the first zone. Null when the row has no zone.
 */
export function dtfRowZoneId(
  zones: readonly { id: string }[],
  rowZoneHint: string | null | undefined,
  existingPaperType: string | null,
): string | null {
  if (rowZoneHint && zones.some((z) => z.id === rowZoneHint)) return rowZoneHint;
  const tagged: string | null = dtfZoneIdFromPaperType(existingPaperType);
  if (tagged && zones.some((z) => z.id === tagged)) return tagged;
  return zones[0]?.id ?? null;
}

/** Zone files that will be sent: zones still on the row, with artwork, not the row zone, in zone order. */
export function dtfZoneFileEntries(
  zones: readonly { id: string }[],
  rowZoneId: string | null,
  zoneFiles: WizardDtfZoneFiles | null | undefined,
): { zoneId: string; entry: WizardDtfZoneFile }[] {
  if (!zoneFiles) return [];
  return zones.flatMap((z) => {
    const entry = zoneFiles[z.id];
    return z.id !== rowZoneId && entry && dtfZoneFileHasArtwork(entry) ? [{ zoneId: z.id, entry }] : [];
  });
}

/**
 * Zone files and row zone after the zones changed: files of removed zones go;
 * when the row zone itself went, the row file moves to the first zone without
 * a file. Returns the inputs unchanged when nothing needs to move.
 */
export function reconcileDtfZoneFiles(
  zones: readonly { id: string }[],
  rowZoneHint: string | null | undefined,
  zoneFiles: WizardDtfZoneFiles | null | undefined,
): { dtfRowZoneId: string | null | undefined; dtfZoneFiles: WizardDtfZoneFiles | null | undefined } {
  let files = zoneFiles;
  if (files) {
    const kept = Object.entries(files).filter(([id]) => zones.some((z) => z.id === id));
    if (kept.length !== Object.keys(files).length) files = Object.fromEntries(kept);
  }
  let hint = rowZoneHint;
  const hintOk: boolean = hint != null && zones.some((z) => z.id === hint);
  const fallback: string | undefined = zones[0]?.id;
  const current: string | undefined = hintOk ? hint! : fallback;
  if (current && files && dtfZoneFileHasArtwork(files[current])) {
    // The row zone went and the next zone already has its own file.
    const free = zones.find((z) => !dtfZoneFileHasArtwork(files![z.id]));
    if (free) hint = free.id;
  } else if (hint != null && !hintOk) {
    hint = undefined;
  }
  return { dtfRowZoneId: hint, dtfZoneFiles: files };
}

/**
 * Whether a zone may be removed: the row's file needs a zone without its own
 * file to move to when its zone goes.
 */
export function canRemoveDtfZone(
  zones: readonly { id: string }[],
  rowZoneId: string | null,
  zoneFiles: WizardDtfZoneFiles | null | undefined,
  zoneId: string,
): boolean {
  if (zones.length <= 1) return false;
  if (zoneId !== rowZoneId) return true;
  return zones.some((z) => z.id !== zoneId && !dtfZoneFileHasArtwork(zoneFiles?.[z.id]));
}

/** One zone file of a line payload: a new stored key, or a file already on the order. */
export type DtfZoneFileSpec =
  | { fileName: string; fileUrl: string; paperType: string }
  | { fileId: string; paperType: string };

/**
 * Line file specs of the row's zone files (uploads the fresh ones through
 * `upload`, which may be a placeholder for a dry-run price).
 */
export async function dtfZoneFileSpecs(
  zones: readonly { id: string }[],
  rowZoneId: string | null,
  zoneFiles: WizardDtfZoneFiles | null | undefined,
  upload: (file: File) => Promise<{ fileName: string; fileUrl: string }>,
): Promise<DtfZoneFileSpec[]> {
  const out: DtfZoneFileSpec[] = [];
  for (const { zoneId, entry } of dtfZoneFileEntries(zones, rowZoneId, zoneFiles)) {
    const paperType: string = dtfZoneFilePaperType(zoneId);
    if (entry.file) {
      const { fileName, fileUrl } = await upload(entry.file);
      out.push({ fileName, fileUrl, paperType });
    } else if (entry.existing) {
      out.push({ fileId: entry.existing.id, paperType });
    } else if (entry.reuse) {
      out.push({ fileName: entry.reuse.fileName, fileUrl: entry.reuse.fileUrl, paperType });
    }
  }
  return out;
}

/** True when the row's zone files include a fresh upload (for the upload checklist). */
export function dtfZoneFilesNeedUpload(zoneFiles: WizardDtfZoneFiles | null | undefined): boolean {
  return Object.values(zoneFiles ?? {}).some((e) => Boolean(e.file));
}
