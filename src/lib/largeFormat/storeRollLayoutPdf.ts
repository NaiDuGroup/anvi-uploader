import { randomBytes } from "node:crypto";
import { saveLocalFile } from "@/lib/local-storage";
import {
  getPresignedDownloadUrl,
  isLocalObjectStorage,
  putObjectBuffer,
} from "@/lib/r2";

export type LayoutFileContentType = "application/pdf" | "image/png";

const EXTENSION_BY_CONTENT_TYPE: Record<LayoutFileContentType, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
};

export interface StoredLayoutFile {
  downloadUrl: string;
  fileName: string;
}

/**
 * Vercel caps function response bodies (~4.5 MB), so generated layouts are
 * stored and handed back as a download URL.
 */
export async function storeLayoutFile(
  bytes: Uint8Array,
  fileName: string,
  contentType: LayoutFileContentType,
): Promise<StoredLayoutFile> {
  const ext = EXTENSION_BY_CONTENT_TYPE[contentType];
  const key = `layouts/${Date.now()}-${randomBytes(8).toString("hex")}.${ext}`;
  const body = bytes instanceof Buffer ? bytes : Buffer.from(bytes);

  if (isLocalObjectStorage()) {
    await saveLocalFile(key, body);
    return {
      downloadUrl: `/api/workshop-board/layout-pdf/download?key=${encodeURIComponent(key)}&name=${encodeURIComponent(fileName)}`,
      fileName,
    };
  }

  await putObjectBuffer(key, body, contentType, {
    contentDisposition: `attachment; filename="${encodeURIComponent(fileName)}"`,
  });
  const downloadUrl = await getPresignedDownloadUrl(key);
  return { downloadUrl, fileName };
}

export async function storeRollLayoutPdf(
  pdfBytes: Uint8Array,
  fileName: string,
): Promise<StoredLayoutFile> {
  return storeLayoutFile(pdfBytes, fileName, "application/pdf");
}
