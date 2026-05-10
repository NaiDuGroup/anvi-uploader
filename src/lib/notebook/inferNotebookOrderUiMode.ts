import type { NotebookLayoutData } from "@/lib/validations";

/**
 * Distinguishes orders created via the template editor vs «upload ready layout» flow.
 * Upload-ready orders store the same empty stub as a fresh admin upload (no photos, no text).
 */
export function inferNotebookOrderUiMode(
  notebookLayoutData: NotebookLayoutData | Record<string, unknown> | null | undefined,
): "editor" | "upload_ready" {
  if (!notebookLayoutData || typeof notebookLayoutData !== "object") return "editor";
  const md = notebookLayoutData as NotebookLayoutData;
  const photos = Array.isArray(md.photoUrls) ? md.photoUrls : [];
  const text = typeof md.text === "string" ? md.text.trim() : "";
  if (photos.length > 0 || text.length > 0) return "editor";
  return "upload_ready";
}
