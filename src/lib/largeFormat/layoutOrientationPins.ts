import type {
  GroupTilePackResult,
  GroupTilePackTile,
} from "./groupTilePack";

/** Manual orientation lock for a single tile copy (`${orderLineId}::${copy}`). */
export type OrientationPin = "natural" | "rotated";

const EPS = 1e-6;

export function isSquareTile(
  tile: Pick<GroupTilePackTile, "widthCm" | "heightCm">,
): boolean {
  return Math.abs(tile.widthCm - tile.heightCm) <= EPS;
}

/** Whether the given pin fits across the printable width (with gap). */
export function pinFitsPrintableWidth(
  tile: Pick<GroupTilePackTile, "widthCm" | "heightCm">,
  pin: OrientationPin,
  printableWidthCm: number,
  gapCm: number,
): boolean {
  const cross = pin === "rotated" ? tile.heightCm : tile.widthCm;
  return cross + gapCm <= printableWidthCm + EPS;
}

/**
 * Apply orientation pins before packing: lock `allowRotate` and present
 * already-swapped dimensions for a `rotated` pin. Placement `rotated` flags
 * are restored afterwards via {@link withPinRotatedFlags} so PDF content
 * rotation still works.
 */
export function applyOrientationPins<T extends GroupTilePackTile>(
  tiles: readonly T[],
  pins: ReadonlyMap<string, OrientationPin>,
): T[] {
  if (pins.size === 0) return [...tiles];
  return tiles.map((tile) => {
    const pin = pins.get(tile.id);
    if (!pin) return tile;
    if (pin === "natural") {
      return { ...tile, allowRotate: false };
    }
    return {
      ...tile,
      widthCm: tile.heightCm,
      heightCm: tile.widthCm,
      allowRotate: false,
    };
  });
}

export function withPinRotatedFlags(
  result: GroupTilePackResult,
  pins: ReadonlyMap<string, OrientationPin>,
): GroupTilePackResult {
  if (pins.size === 0) return result;
  return {
    ...result,
    placements: result.placements.map((p) => {
      const pin = pins.get(p.tileId);
      if (!pin) return p;
      return { ...p, rotated: pin === "rotated" };
    }),
  };
}

/** Cycle: auto → natural → rotated → auto. */
export function nextOrientationPin(
  pin: OrientationPin | undefined,
): OrientationPin | undefined {
  if (pin === undefined) return "natural";
  if (pin === "natural") return "rotated";
  return undefined;
}

/**
 * Advance the pin cycle, skipping orientations that cannot fit the roll.
 */
export function cycleOrientationPin(
  pin: OrientationPin | undefined,
  tile: Pick<GroupTilePackTile, "widthCm" | "heightCm">,
  printableWidthCm: number,
  gapCm: number,
): OrientationPin | undefined {
  let nextPin = nextOrientationPin(pin);
  while (
    nextPin !== undefined &&
    !pinFitsPrintableWidth(tile, nextPin, printableWidthCm, gapCm)
  ) {
    nextPin = nextOrientationPin(nextPin);
  }
  return nextPin;
}
