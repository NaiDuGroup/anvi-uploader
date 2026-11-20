import { readLocalFile } from "@/lib/local-storage";
import { getPresignedDownloadUrl, isLocalObjectStorage } from "@/lib/r2";

/** Load an order file payload from local storage or R2. */
export async function readOrderFileBuffer(fileUrl: string): Promise<Buffer | null> {
  // Read per call (not at import) so tests can switch to local storage.
  if (isLocalObjectStorage()) {
    return readLocalFile(fileUrl);
  }
  try {
    const downloadUrl = await getPresignedDownloadUrl(fileUrl);
    const res = await fetch(downloadUrl);
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch {
    return null;
  }
}
