import type { GroupTilePackPlacement } from "./groupTilePack";
import {
  buildRollLayoutPdfBuffer,
  buildSheetLayoutPdfBuffer,
  type RollLayoutPdfAssetInput,
} from "./rollLayoutPdfCore";

export interface BuildRollLayoutPdfClientInput {
  printableWidthCm: number;
  totalAlongCm: number;
  placements: readonly GroupTilePackPlacement[];
  tiles: ReadonlyArray<{ tileId: string; fileId: string }>;
  fileNamesById: ReadonlyMap<string, string>;
  /** White margin (cm) per tile id (e.g. BANNER MATT → 4 cm). */
  borderCmByTileId?: ReadonlyMap<string, number>;
}

/**
 * Downloads print files on demand for a layout PDF. A file is dropped from the
 * cache once its last copy is fetched, so several multi-hundred-MB banners are
 * not all held at once.
 */
function browserAssetLoader(
  placements: readonly GroupTilePackPlacement[],
  tiles: ReadonlyArray<{ tileId: string; fileId: string }>,
  fileNamesById: ReadonlyMap<string, string>,
): {
  getAsset: (tileId: string) => Promise<RollLayoutPdfAssetInput>;
  releaseAssets: () => void;
} {
  const tileToFileId = new Map(tiles.map((t) => [t.tileId, t.fileId]));
  const fileCache = new Map<string, Uint8Array>();
  const usesLeft = new Map<string, number>();
  for (const p of placements) {
    const fileId = tileToFileId.get(p.tileId);
    if (fileId) usesLeft.set(fileId, (usesLeft.get(fileId) ?? 0) + 1);
  }
  return {
    getAsset: async (tileId) => {
      const fileId = tileToFileId.get(tileId);
      if (!fileId) {
        throw new Error(`No file mapped for tile ${tileId}`);
      }
      const fileName = fileNamesById.get(fileId);
      if (!fileName) {
        throw new Error(`Unknown file id ${fileId}`);
      }
      let buffer = fileCache.get(fileId);
      if (!buffer) {
        const res = await fetch(`/api/download/${fileId}`);
        if (!res.ok) {
          throw new Error(`Could not download ${fileName} (HTTP ${res.status})`);
        }
        buffer = new Uint8Array(await res.arrayBuffer());
        fileCache.set(fileId, buffer);
      }
      const left = (usesLeft.get(fileId) ?? 1) - 1;
      usesLeft.set(fileId, left);
      if (left <= 0) fileCache.delete(fileId);
      return { tileId, fileName, buffer };
    },
    releaseAssets: () => fileCache.clear(),
  };
}

/**
 * Assemble the roll PDF in the browser — avoids Vercel memory/response limits
 * for multi-hundred-MB wide-format banners.
 */
export async function buildRollLayoutPdfInBrowser(
  input: BuildRollLayoutPdfClientInput,
): Promise<Uint8Array> {
  return buildRollLayoutPdfBuffer({
    printableWidthCm: input.printableWidthCm,
    totalAlongCm: input.totalAlongCm,
    placements: input.placements,
    borderCmByTileId: input.borderCmByTileId,
    ...browserAssetLoader(input.placements, input.tiles, input.fileNamesById),
  });
}

export interface BuildSheetLayoutPdfClientInput {
  sheetWidthCm: number;
  sheetHeightCm: number;
  /** Pieces per sheet (sheet coordinates); one PDF page each. */
  sheets: ReadonlyArray<readonly GroupTilePackPlacement[]>;
  tiles: ReadonlyArray<{ tileId: string; fileId: string }>;
  fileNamesById: ReadonlyMap<string, string>;
  borderCmByTileId?: ReadonlyMap<string, number>;
}

/** Sheet layout PDF (one page per sheet, page = sheet size) assembled in the browser. */
export async function buildSheetLayoutPdfInBrowser(
  input: BuildSheetLayoutPdfClientInput,
): Promise<Uint8Array> {
  return buildSheetLayoutPdfBuffer({
    sheetWidthCm: input.sheetWidthCm,
    sheetHeightCm: input.sheetHeightCm,
    sheets: input.sheets,
    borderCmByTileId: input.borderCmByTileId,
    ...browserAssetLoader(input.sheets.flat(), input.tiles, input.fileNamesById),
  });
}
