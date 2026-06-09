import { readLocalFile } from "@/lib/local-storage";
import { getPresignedDownloadUrl } from "@/lib/r2";

const isLocalDev = process.env.R2_ACCOUNT_ID === "local-dev";

/** Load an order file payload from local storage or R2. */
export async function readOrderFileBuffer(fileUrl: string): Promise<Buffer | null> {
  if (isLocalDev) {
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
