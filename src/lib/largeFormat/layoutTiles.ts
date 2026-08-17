import type { GroupTilePackTile } from "@/lib/largeFormat/groupTilePack";
import {
  resolveGalleryWrapCm,
  resolveLayoutBorderCm,
} from "@/lib/largeFormat/lfLayoutBorder";
import type { WorkshopBoardLine } from "@/lib/workshopBoard/types";

/**
 * Tiles for a workshop roll layout, expanded per copy from LF board lines.
 * Shared between the layout planner modal and the board card roll-cost hint,
 * so both price exactly the same tile set.
 */

export interface PreparedTile extends GroupTilePackTile {
  colorIdx: number;
  /** White margin (cm) added on every side; 0 for materials without a border. */
  borderCm: number;
  /**
   * Mirrored gallery-wrap margin (cm) added on every side for canvas; 0
   * otherwise. Mutually exclusive with {@link borderCm}: white band vs mirror.
   */
  galleryWrapCm: number;
}

export function prepareTiles(
  lines: WorkshopBoardLine[],
  orderColorMap: ReadonlyMap<number, number>,
  includeBorder: boolean,
): PreparedTile[] {
  const tiles: PreparedTile[] = [];

  for (const line of lines) {
    if (line.facts.kind !== "lf") continue;
    const { widthCm, heightCm, quantity, materialName } = line.facts.data;
    const { orderNumber, orderLineId, lineIndex, totalLines } = line;
    const colorIdx = orderColorMap.get(orderNumber) ?? 0;
    // Some materials grow the footprint by an extra margin on every side:
    //  • BANNER MATT → a blank white band (`borderCm`) — can be switched off
    //    by the user via the modal checkbox (`includeBorder`)
    //  • canvas / "Panza din bumbac" → a mirrored gallery-wrap (`galleryWrapCm`)
    // Both inflate the roll footprint by 2× the margin per axis (mutually
    // exclusive, but summed defensively).
    const borderCm = includeBorder ? resolveLayoutBorderCm(materialName) : 0;
    const galleryWrapCm = resolveGalleryWrapCm(materialName);
    const marginCm = borderCm + galleryWrapCm;

    for (let copy = 1; copy <= quantity; copy++) {
      const label = totalLines > 1
        ? `#${orderNumber}.${lineIndex}/${totalLines} (${copy}/${quantity})`
        : `#${orderNumber} (${copy}/${quantity})`;
      tiles.push({
        id: `${orderLineId}::${copy}`,
        label,
        widthCm: widthCm + 2 * marginCm,
        heightCm: heightCm + 2 * marginCm,
        allowRotate: true,
        colorIdx,
        borderCm,
        galleryWrapCm,
      });
    }
  }
  return tiles;
}
