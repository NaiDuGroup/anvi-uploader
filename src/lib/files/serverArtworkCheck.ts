import { checkArtworkSize } from "./artworkSizeCheck";
import { readFileMeta } from "./fileMeta";

/**
 * Cabinet guard: does any large-format file print bigger than the size the
 * client declared (and was priced for)? Reads each file's header from storage.
 * Returns the offending file name, or null.
 */
export async function findArtworkLargerThanOrdered(
  lines: readonly {
    productType: string;
    printWidthCm?: number;
    printHeightCm?: number;
    files: readonly { fileName: string; fileUrl: string }[];
  }[],
): Promise<string | null> {
  for (const line of lines) {
    if (line.productType !== "large_format_print") continue;
    if (!line.printWidthCm || !line.printHeightCm) continue;
    for (const f of line.files) {
      let meta;
      try {
        meta = await readFileMeta(f.fileUrl, f.fileName);
      } catch {
        continue; // storage hiccup: do not block on a guess
      }
      const check = checkArtworkSize(meta, { widthCm: line.printWidthCm, heightCm: line.printHeightCm });
      if (check?.issues.includes("larger")) return f.fileName;
    }
  }
  return null;
}
