import path from "node:path";
import { promises as fs } from "node:fs";
import { readLocalFile } from "@/lib/local-storage";
import { getPresignedDownloadUrl, isLocalObjectStorage } from "@/lib/r2";

/**
 * Load logo bytes for PDFs and streaming routes: public file, remote URL, or object storage key.
 */
export async function resolveCompanyLogoBuffer(
  logoPath: string | null | undefined,
): Promise<Buffer | null> {
  const raw = logoPath?.trim();
  if (!raw) return null;

  if (raw.startsWith("https://") || raw.startsWith("http://")) {
    try {
      const res = await fetch(raw);
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch {
      return null;
    }
  }

  if (raw.startsWith("/")) {
    const relative = raw.slice(1);
    const abs = path.join(process.cwd(), "public", relative);
    try {
      return await fs.readFile(abs);
    } catch {
      return null;
    }
  }

  if (raw.includes("..")) return null;

  if (isLocalObjectStorage()) {
    const data = await readLocalFile(raw);
    return data ?? null;
  }

  try {
    const downloadUrl = await getPresignedDownloadUrl(raw);
    const objRes = await fetch(downloadUrl);
    if (!objRes.ok) return null;
    return Buffer.from(await objRes.arrayBuffer());
  } catch {
    return null;
  }
}
