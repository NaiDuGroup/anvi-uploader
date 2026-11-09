import { dtfZoneFilePaperType, dtfZoneIdFromPaperType } from "@/lib/dtf/dtfConstants";
import { uvZoneFilePaperType, uvZoneIdFromPaperType } from "@/lib/uv/uvConstants";
import type { WizardReusedFile } from "@/app/admin/_components/library/wizardReuse";

/**
 * Artwork of one more print zone on a wizard row: DTF front + back on one
 * T-shirt, UV on both sides of one mug / notebook. The row's own file prints
 * in the row zone; every other zone may carry its file here, so the line is
 * one item with several prints instead of one item per file. Same three
 * sources as a business-card reverse.
 */
export interface WizardZoneFile {
  /** Fresh upload. */
  file?: File;
  /** Edit mode: file already stored on the order. */
  existing?: { id: string; fileName: string; paperType: string | null };
  /** «Повторить заказ» / library: stored key reused as is. */
  reuse?: WizardReusedFile;
}

/** Zone id → its artwork. */
export type WizardZoneFiles = Record<string, WizardZoneFile>;

/** How a product's files name their zone in `File.paperType` (`dtf:<id>`, `uv:<id>`). */
export interface ZoneFileTag {
  paperType: (zoneId: string) => string;
  zoneIdOf: (paperType: string | null | undefined) => string | null;
}

export const DTF_ZONE_FILE_TAG: ZoneFileTag = {
  paperType: dtfZoneFilePaperType,
  zoneIdOf: dtfZoneIdFromPaperType,
};

export const UV_ZONE_FILE_TAG: ZoneFileTag = {
  paperType: uvZoneFilePaperType,
  zoneIdOf: uvZoneIdFromPaperType,
};

/** Zone tag of a product whose line may carry a file per zone (DTF, UV); null otherwise. */
export function zoneFileTagFor(productType: string): ZoneFileTag | null {
  if (productType === "dtf_apparel") return DTF_ZONE_FILE_TAG;
  if (productType === "uv_print") return UV_ZONE_FILE_TAG;
  return null;
}

export function zoneFileHasArtwork(e: WizardZoneFile | null | undefined): boolean {
  return Boolean(e && (e.file || e.existing || e.reuse));
}

export function zoneFileName(e: WizardZoneFile | null | undefined): string | null {
  return e?.file?.name ?? e?.existing?.fileName ?? e?.reuse?.fileName ?? null;
}

/**
 * Zone the row's own file prints in: the row's chosen zone, else the zone the
 * stored file is tagged to, else the first zone. Null when the row has no zone.
 */
export function rowZoneId(
  zones: readonly { id: string }[],
  rowZoneHint: string | null | undefined,
  existingPaperType: string | null,
  tag: ZoneFileTag,
): string | null {
  if (rowZoneHint && zones.some((z) => z.id === rowZoneHint)) return rowZoneHint;
  const tagged: string | null = tag.zoneIdOf(existingPaperType);
  if (tagged && zones.some((z) => z.id === tagged)) return tagged;
  return zones[0]?.id ?? null;
}

/** Zone files that will be sent: zones still on the row, with artwork, not the row zone, in zone order. */
export function zoneFileEntries(
  zones: readonly { id: string }[],
  rowZone: string | null,
  zoneFiles: WizardZoneFiles | null | undefined,
): { zoneId: string; entry: WizardZoneFile }[] {
  if (!zoneFiles) return [];
  return zones.flatMap((z) => {
    const entry = zoneFiles[z.id];
    return z.id !== rowZone && entry && zoneFileHasArtwork(entry) ? [{ zoneId: z.id, entry }] : [];
  });
}

/**
 * Zone files and row zone after the zones changed: files of removed zones go;
 * when the row zone itself went, the row file moves to the first zone without
 * a file. Returns the inputs unchanged when nothing needs to move.
 */
export function reconcileZoneFiles(
  zones: readonly { id: string }[],
  rowZoneHint: string | null | undefined,
  zoneFiles: WizardZoneFiles | null | undefined,
): { rowZoneId: string | null | undefined; zoneFiles: WizardZoneFiles | null | undefined } {
  let files = zoneFiles;
  if (files) {
    const kept = Object.entries(files).filter(([id]) => zones.some((z) => z.id === id));
    if (kept.length !== Object.keys(files).length) files = Object.fromEntries(kept);
  }
  let hint = rowZoneHint;
  const hintOk: boolean = hint != null && zones.some((z) => z.id === hint);
  const fallback: string | undefined = zones[0]?.id;
  const current: string | undefined = hintOk ? hint! : fallback;
  if (current && files && zoneFileHasArtwork(files[current])) {
    // The row zone went and the next zone already has its own file.
    const free = zones.find((z) => !zoneFileHasArtwork(files![z.id]));
    if (free) hint = free.id;
  } else if (hint != null && !hintOk) {
    hint = undefined;
  }
  return { rowZoneId: hint, zoneFiles: files };
}

/**
 * Whether a zone may be removed: the row's file needs a zone without its own
 * file to move to when its zone goes.
 */
export function canRemoveFileZone(
  zones: readonly { id: string }[],
  rowZone: string | null,
  zoneFiles: WizardZoneFiles | null | undefined,
  zoneId: string,
): boolean {
  if (zones.length <= 1) return false;
  if (zoneId !== rowZone) return true;
  return zones.some((z) => z.id !== zoneId && !zoneFileHasArtwork(zoneFiles?.[z.id]));
}

/** One zone file of a line payload: a new stored key, or a file already on the order. */
export type ZoneFileSpec =
  | { fileName: string; fileUrl: string; paperType: string }
  | { fileId: string; paperType: string };

/**
 * Line file specs of the row's zone files, tagged with `tag` (uploads the
 * fresh ones through `upload`, which may be a placeholder for a dry-run price).
 */
export async function zoneFileSpecs(
  zones: readonly { id: string }[],
  rowZone: string | null,
  zoneFiles: WizardZoneFiles | null | undefined,
  tag: ZoneFileTag,
  upload: (file: File) => Promise<{ fileName: string; fileUrl: string }>,
): Promise<ZoneFileSpec[]> {
  const out: ZoneFileSpec[] = [];
  for (const { zoneId, entry } of zoneFileEntries(zones, rowZone, zoneFiles)) {
    const paperType: string = tag.paperType(zoneId);
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
export function zoneFilesNeedUpload(zoneFiles: WizardZoneFiles | null | undefined): boolean {
  return Object.values(zoneFiles ?? {}).some((e) => Boolean(e.file));
}
