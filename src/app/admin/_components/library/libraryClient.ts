"use client";

/** Client-side shapes and calls of «Библиотека макетов» (`/api/admin/library`). */
export interface LibraryItem {
  id: string;
  clientId: string | null;
  clientName: string | null;
  clientPhone: string | null;
  title: string;
  tags: string[];
  storageKey: string;
  fileName: string;
  sizeBytes: number | null;
  pixelWidth: number | null;
  pixelHeight: number | null;
  dpi: number | null;
  widthMm: number | null;
  heightMm: number | null;
  pageCount: number | null;
  sourceOrderId: string | null;
  sourceOrderNumber: number | null;
  sourceFileId: string | null;
  useCount: number;
  lastUsedAt: string | null;
  createdAt: string;
  archivedAt: string | null;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number; body?: unknown };

export async function libraryFetch<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: init?.body ? { "Content-Type": "application/json", ...(init.headers ?? {}) } : init?.headers,
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { ok: false, error: body.error || "Ошибка запроса", status: res.status, body };
    return { ok: true, data: body as T };
  } catch {
    return { ok: false, error: "Нет связи с сервером", status: 0 };
  }
}

const PREVIEW_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp", "avif", "bmp"]);
/** Above this the grid shows a type label instead of loading the whole image. */
const PREVIEW_MAX_BYTES = 15 * 1024 * 1024;

export function libraryFileUrl(id: string, download = false): string {
  return `/api/admin/library/${id}/file${download ? "?download=1" : ""}`;
}

export function libraryHasImagePreview(item: Pick<LibraryItem, "fileName" | "sizeBytes">): boolean {
  const ext = item.fileName.split(".").pop()?.toLowerCase() ?? "";
  return PREVIEW_EXTS.has(ext) && (item.sizeBytes == null || item.sizeBytes <= PREVIEW_MAX_BYTES);
}

export function libraryExt(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(dot + 1).toUpperCase().slice(0, 4) : "?";
}

/** «12,4 МБ · 3000×2000 px · 300 dpi · 25×17 см» — the facts that are known. */
export function libraryMetaText(item: Pick<LibraryItem, "sizeBytes" | "pixelWidth" | "pixelHeight" | "dpi" | "widthMm" | "heightMm" | "pageCount">): string {
  const parts: string[] = [];
  if (item.sizeBytes != null) {
    const mb = item.sizeBytes / (1024 * 1024);
    parts.push(mb >= 1 ? `${mb.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} МБ` : `${Math.max(1, Math.round(item.sizeBytes / 1024))} КБ`);
  }
  if (item.pixelWidth && item.pixelHeight) parts.push(`${item.pixelWidth}×${item.pixelHeight} px`);
  if (item.dpi) parts.push(`${Math.round(item.dpi)} dpi`);
  if (item.widthMm && item.heightMm) {
    const cm = (mm: number) => (mm / 10).toLocaleString("ru-RU", { maximumFractionDigits: 1 });
    parts.push(`${cm(item.widthMm)}×${cm(item.heightMm)} см`);
  }
  if (item.pageCount && item.pageCount > 1) parts.push(`${item.pageCount} стр.`);
  return parts.join(" · ");
}
