import { describe, expect, it } from "vitest";
import { buildBusinessCardLayoutZip } from "./businessCardLayoutZip";

const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;

interface ZipListing {
  name: string;
  uncompressedSize: number;
}

/** Read entry names and sizes from the ZIP central directory. */
function listZipEntries(zip: Buffer): ZipListing[] {
  const entries: ZipListing[] = [];
  for (let i = 0; i <= zip.length - 46; i++) {
    if (zip.readUInt32LE(i) !== CENTRAL_DIRECTORY_SIGNATURE) continue;
    const nameLength = zip.readUInt16LE(i + 28);
    entries.push({
      uncompressedSize: zip.readUInt32LE(i + 24),
      name: zip.subarray(i + 46, i + 46 + nameLength).toString("utf8"),
    });
    i += 45 + nameLength;
  }
  return entries;
}

describe("buildBusinessCardLayoutZip", () => {
  it("puts every sheet inside a folder named after the order number", async () => {
    const front = Buffer.from("front-sheet");
    const back = Buffer.from("back-sheet-png");
    const zip = await buildBusinessCardLayoutZip("9180", [
      { name: "vizitki-9180-litso.png", data: front },
      { name: "vizitki-9180-oborot.png", data: back },
    ]);

    expect(listZipEntries(zip)).toEqual([
      { name: "9180/vizitki-9180-litso.png", uncompressedSize: front.length },
      { name: "9180/vizitki-9180-oborot.png", uncompressedSize: back.length },
    ]);
  });
});
