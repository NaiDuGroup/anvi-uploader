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
