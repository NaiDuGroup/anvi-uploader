import { randomBytes } from "node:crypto";
import { saveLocalFile } from "@/lib/local-storage";
import {
  getPresignedDownloadUrl,
  isLocalObjectStorage,
  putObjectBuffer,
} from "@/lib/r2";

export async function storeRollLayoutPdf(
  pdfBytes: Uint8Array,
  fileName: string,
): Promise<{ downloadUrl: string; fileName: string }> {
  const key = `layouts/${Date.now()}-${randomBytes(8).toString("hex")}.pdf`;
  const body =
    pdfBytes instanceof Buffer ? pdfBytes : Buffer.from(pdfBytes);

  if (isLocalObjectStorage()) {
    await saveLocalFile(key, body);
    return {
      downloadUrl: `/api/workshop-board/layout-pdf/download?key=${encodeURIComponent(key)}`,
      fileName,
    };
  }

  await putObjectBuffer(key, body, "application/pdf", {
    contentDisposition: `attachment; filename="${encodeURIComponent(fileName)}"`,
  });
  const downloadUrl = await getPresignedDownloadUrl(key);
  return { downloadUrl, fileName };
}
