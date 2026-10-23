import {
  packGroupTiles,
  type GroupTilePackResult,
  type GroupTilePackTile,
} from "@/lib/largeFormat/groupTilePack";
import type { DtfFilmSpec, WorkshopBoardLine } from "@/lib/workshopBoard/types";

export interface DtfFilmTileFile {
  tileId: string;
  fileId: string;
}

export interface DtfFilmLayout {
  pack: GroupTilePackResult;
  /** Tile → artwork mapping for the layout PDF; only tiles that have artwork. */
  tileFiles: DtfFilmTileFile[];
  /** Transfers (zone × piece) that have no artwork uploaded yet. */
  missingArtworkCount: number;
}

/**
 * Nests every transfer of the given DTF lines onto one film strip: each zone is
 * printed once per garment, so a 12-piece line with front + back adds 24 tiles.
 */
export function buildDtfFilmLayout(
  lines: readonly WorkshopBoardLine[],
  film: DtfFilmSpec,
): DtfFilmLayout {
  const tiles: GroupTilePackTile[] = [];
  const tileFiles: DtfFilmTileFile[] = [];
  let missingArtworkCount = 0;

  for (const line of lines) {
    if (line.facts.kind !== "dtf") continue;
    const { quantity, transfers } = line.facts.data;
    for (const transfer of transfers) {
      for (let copy = 0; copy < quantity; copy++) {
        const tileId = `${line.orderLineId}::${transfer.zoneId}::${copy}`;
        tiles.push({
          id: tileId,
          label: `#${line.orderNumber} ${transfer.presetLabel} (${copy + 1}/${quantity})`,
          widthCm: transfer.widthCm,
          heightCm: transfer.heightCm,
          allowRotate: true,
        });
        if (transfer.fileId) {
          tileFiles.push({ tileId, fileId: transfer.fileId });
        } else {
          missingArtworkCount++;
        }
      }
    }
  }

  return {
    pack: packGroupTiles(tiles, film.printableWidthCm, film.gapCm),
    tileFiles,
    missingArtworkCount,
  };
}
