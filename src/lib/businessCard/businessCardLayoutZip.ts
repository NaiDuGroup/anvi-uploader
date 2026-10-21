import archiver from "archiver";

export interface BusinessCardLayoutZipEntry {
  name: string;
  data: Buffer;
}

/**
 * Pack the layout sheets into one ZIP with every file inside `folderName/`
 * (the order number), so the workshop unpacks straight into a per-order folder.
 * PNGs are already compressed, so entries are stored as-is.
 */
export function buildBusinessCardLayoutZip(
  folderName: string,
  entries: readonly BusinessCardLayoutZipEntry[],
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const archive = archiver("zip", { store: true });
    const chunks: Buffer[] = [];
    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("warning", reject);
    archive.on("error", reject);

    for (const entry of entries) {
      archive.append(entry.data, { name: `${folderName}/${entry.name}` });
    }
    void archive.finalize();
  });
}
