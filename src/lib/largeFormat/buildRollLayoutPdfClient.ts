import type { GroupTilePackPlacement } from "./groupTilePack";
import { buildRollLayoutPdfBuffer } from "./rollLayoutPdfCore";

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
 * Assemble the roll PDF in the browser — avoids Vercel memory/response limits
 * for multi-hundred-MB wide-format banners.
 */
export async function buildRollLayoutPdfInBrowser(
  input: BuildRollLayoutPdfClientInput,
): Promise<Uint8Array> {
  const tileToFileId = new Map(input.tiles.map((t) => [t.tileId, t.fileId]));
  const fileCache = new Map<string, Uint8Array>();

  return buildRollLayoutPdfBuffer({
    printableWidthCm: input.printableWidthCm,
    totalAlongCm: input.totalAlongCm,
    placements: input.placements,
    borderCmByTileId: input.borderCmByTileId,
    getAsset: async (tileId) => {
      const fileId = tileToFileId.get(tileId);
      if (!fileId) {
        throw new Error(`No file mapped for tile ${tileId}`);
      }
      const fileName = input.fileNamesById.get(fileId);
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
      return { tileId, fileName, buffer };
    },
    releaseAssets: () => fileCache.clear(),
  });
}
