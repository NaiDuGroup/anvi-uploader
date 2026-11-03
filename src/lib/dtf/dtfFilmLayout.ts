import type { WorkshopBoardLine } from "@/lib/workshopBoard/types";

/** One transfer to print: a zone of one garment, with its artwork. */
export interface DtfFilmTransfer {
  tileId: string;
  fileId: string;
  widthCm: number;
  heightCm: number;
}

export interface DtfFilmTransfers {
  transfers: DtfFilmTransfer[];
  /** Transfers (zone × piece) that have no artwork uploaded yet. */
  missingArtworkCount: number;
  orderNumbers: number[];
}

/**
 * Every transfer of the given DTF lines, ready for the workshop film
 * (`/api/workshop-board/dtf-film`): each zone is printed once per garment, so
 * a 12-piece line with front + back gives 24 transfers.
 */
export function collectDtfFilmTransfers(lines: readonly WorkshopBoardLine[]): DtfFilmTransfers {
  const transfers: DtfFilmTransfer[] = [];
  const orderNumbers = new Set<number>();
  let missingArtworkCount = 0;

  for (const line of lines) {
    if (line.facts.kind !== "dtf") continue;
    const { quantity, transfers: zones } = line.facts.data;
    orderNumbers.add(line.orderNumber);
    for (const zone of zones) {
      if (!zone.fileId) {
        missingArtworkCount += quantity;
        continue;
      }
      for (let copy = 0; copy < quantity; copy++) {
        transfers.push({
          tileId: `${line.orderLineId}::${zone.zoneId}::${copy}`,
          fileId: zone.fileId,
          widthCm: zone.widthCm,
          heightCm: zone.heightCm,
        });
      }
    }
  }

  return { transfers, missingArtworkCount, orderNumbers: [...orderNumbers] };
}

/**
 * Every UV-DTF sticker of the given UV lines (technique «transfer»): each zone
 * once per piece, like DTF transfers, for the same film job.
 */
export function collectUvDtfFilmTransfers(lines: readonly WorkshopBoardLine[]): DtfFilmTransfers {
  const transfers: DtfFilmTransfer[] = [];
  const orderNumbers = new Set<number>();
  let missingArtworkCount = 0;

  for (const line of lines) {
    if (line.facts.kind !== "uv" || !line.facts.data.transfer) continue;
    const { quantity, zones } = line.facts.data;
    orderNumbers.add(line.orderNumber);
    for (const zone of zones) {
      if (!zone.fileId) {
        missingArtworkCount += quantity;
        continue;
      }
      for (let copy = 0; copy < quantity; copy++) {
        transfers.push({
          tileId: `${line.orderLineId}::${zone.zoneId}::${copy}`,
          fileId: zone.fileId,
          widthCm: zone.widthCm,
          heightCm: zone.heightCm,
        });
      }
    }
  }

  return { transfers, missingArtworkCount, orderNumbers: [...orderNumbers] };
}

/** True when the lines hold at least one UV-DTF line (the board offers its film). */
export function hasUvDtfLines(lines: readonly WorkshopBoardLine[]): boolean {
  return lines.some((l) => l.facts.kind === "uv" && l.facts.data.transfer === true);
}

/** Statuses whose film is already printed (or past it): not laid out again by default. */
const ALREADY_PRINTED_STATUSES: ReadonlySet<string> = new Set([
  "WORKSHOP_PRINTING",
  "WORKSHOP_READY",
  "RETURNED_TO_STUDIO",
  "DELIVERED",
]);

/** One board line the operator can tick into the film layout. */
export interface FilmLineChoice {
  orderLineId: string;
  /** «#9647.2/2» — order number, line index / lines in the order. */
  label: string;
  phone: string;
  clientName: string | null;
  status: string;
  /** Print sizes of the line's zones, e.g. ["12×19", "5×0.6"]. */
  sizes: string[];
  quantity: number;
  /** Ticked when the layout opens: everything not yet printing in the workshop. */
  defaultSelected: boolean;
}

function sizeText(widthCm: number, heightCm: number): string {
  return `${widthCm}×${heightCm}`;
}

/** The lines of a DTF (or UV-DTF) film card the operator picks from, in board order. */
export function filmLineChoices(
  lines: readonly WorkshopBoardLine[],
  method: "dtf" | "uv_dtf",
): FilmLineChoice[] {
  const out: FilmLineChoice[] = [];
  for (const line of lines) {
    let sizes: string[];
    let quantity: number;
    if (method === "dtf" && line.facts.kind === "dtf") {
      sizes = line.facts.data.transfers.map((z) => sizeText(z.widthCm, z.heightCm));
      quantity = line.facts.data.quantity;
    } else if (method === "uv_dtf" && line.facts.kind === "uv" && line.facts.data.transfer) {
      sizes = line.facts.data.zones.map((z) => sizeText(z.widthCm, z.heightCm));
      quantity = line.facts.data.quantity;
    } else {
      continue;
    }
    out.push({
      orderLineId: line.orderLineId,
      label: `#${line.orderNumber}.${line.lineIndex}/${line.totalLines}`,
      phone: line.phone,
      clientName: line.clientName,
      status: line.status,
      sizes,
      quantity,
      defaultSelected: !ALREADY_PRINTED_STATUSES.has(line.status),
    });
  }
  return out;
}

/** Board lines restricted to the ticked ones (by `orderLineId`). */
export function pickFilmLines(
  lines: readonly WorkshopBoardLine[],
  selected: ReadonlySet<string>,
): WorkshopBoardLine[] {
  return lines.filter((l) => selected.has(l.orderLineId));
}

/** Gap between transfer outlines the operator may choose (mm). */
export const FILM_GAP_MIN_MM = 0;
export const FILM_GAP_MAX_MM = 50;

/** Typed gap → a valid mm value (one decimal), or null when empty/invalid. */
export function parseFilmGapMm(raw: string): number | null {
  const text: string = raw.trim().replace(",", ".");
  if (text === "") return null;
  const n = Number(text);
  if (!Number.isFinite(n) || n < FILM_GAP_MIN_MM || n > FILM_GAP_MAX_MM) return null;
  return Math.round(n * 10) / 10;
}
