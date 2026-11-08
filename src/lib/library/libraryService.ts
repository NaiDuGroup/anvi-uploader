import "server-only";
import { nanoid } from "nanoid";
import type { LibraryFile, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readFileMeta } from "@/lib/files/fileMeta";
import {
  LIBRARY_TITLE_MAX,
  buildLibraryKey,
  defaultLibraryTitle,
  isLibraryKey,
  libraryThumbKeys,
  libraryPhoneSearchDigits,
  normalizeLibraryTags,
} from "./libraryKeys";
import { copyStoredObject, deleteLibraryObject, storedObjectSize } from "./libraryStorage";

/** What the admin UI gets for one library item. */
export interface LibraryFileJson {
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

export const LIBRARY_CLIENT_SELECT = {
  id: true,
  kind: true,
  personName: true,
  companyName: true,
  phone: true,
} as const;

type ClientSlice = {
  kind: string;
  personName: string | null;
  companyName: string | null;
  phone: string | null;
};

export function libraryClientName(c: ClientSlice | null | undefined): string | null {
  if (!c) return null;
  if (c.kind === "LEGAL") {
    if (c.companyName && c.personName) return `${c.companyName} — ${c.personName}`;
    return c.companyName || c.personName || null;
  }
  return c.personName || c.companyName || null;
}

export function serializeLibraryFile(
  row: LibraryFile & { client?: ClientSlice | null },
  sourceOrderNumber: number | null = null,
): LibraryFileJson {
  return {
    id: row.id,
    clientId: row.clientId,
    clientName: libraryClientName(row.client),
    clientPhone: row.client?.phone ?? null,
    title: row.title,
    tags: row.tags,
    storageKey: row.storageKey,
    fileName: row.fileName,
    sizeBytes: row.sizeBytes,
    pixelWidth: row.pixelWidth,
    pixelHeight: row.pixelHeight,
    dpi: row.dpi,
    widthMm: row.widthMm,
    heightMm: row.heightMm,
    pageCount: row.pageCount,
    sourceOrderId: row.sourceOrderId,
    sourceOrderNumber,
    sourceFileId: row.sourceFileId,
    useCount: row.useCount,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
  };
}

/** Order number of the order an item was saved from (null when none / purged). */
export async function librarySourceOrderNumber(sourceOrderId: string | null): Promise<number | null> {
  if (!sourceOrderId) return null;
  const order = await prisma.order.findUnique({ where: { id: sourceOrderId }, select: { orderNumber: true } });
  return order?.orderNumber ?? null;
}

export type SaveToLibraryError =
  | "file_not_found"
  | "is_link"
  | "source_missing"
  | "client_not_found"
  | "already_in_library";

/** Russian messages for the admin UI. */
export const SAVE_TO_LIBRARY_ERROR_RU: Record<SaveToLibraryError, string> = {
  file_not_found: "Файл не найден",
  is_link: "Ссылку нельзя сохранить в библиотеку — нужен загруженный файл",
  source_missing: "Файл уже удалён из хранилища",
  client_not_found: "Клиент не найден",
  already_in_library: "Этот файл уже в библиотеке",
};

/** Non-archived library item made from (or used by) this order file, if any. */
export async function findLibraryItemForFile(file: { id: string; fileUrl: string }): Promise<LibraryFile | null> {
  return prisma.libraryFile.findFirst({
    where: {
      archivedAt: null,
      OR: [{ sourceFileId: file.id }, { storageKey: file.fileUrl }],
    },
  });
}

/**
 * Copy one order file into the library (server-side copy, the original stays
 * untouched) and create its row. The owner is a client id or null («Общий»).
 */
export async function saveOrderFileToLibrary(input: {
  fileId: string;
  title?: string | null;
  tags?: readonly string[] | string | null;
  clientId: string | null;
  actorId: string;
}): Promise<{ ok: true; item: LibraryFileJson } | { ok: false; error: SaveToLibraryError; item?: LibraryFileJson }> {
  const file = await prisma.file.findUnique({
    where: { id: input.fileId },
    select: {
      id: true,
      orderId: true,
      fileUrl: true,
      fileName: true,
      sizeBytes: true,
      pixelWidth: true,
      pixelHeight: true,
      dpi: true,
      widthMm: true,
      heightMm: true,
      pageCount: true,
      metaReadAt: true,
      metaStatus: true,
    },
  });
  if (!file) return { ok: false, error: "file_not_found" };
  if (/^https?:\/\//i.test(file.fileUrl)) return { ok: false, error: "is_link" };

  const existing = await findLibraryItemForFile(file);
  if (existing) {
    const withClient = await prisma.libraryFile.findUnique({
      where: { id: existing.id },
      include: { client: { select: LIBRARY_CLIENT_SELECT } },
    });
    return { ok: false, error: "already_in_library", item: withClient ? serializeLibraryFile(withClient) : undefined };
  }

  if (input.clientId) {
    const c = await prisma.studioCustomer.findUnique({ where: { id: input.clientId }, select: { id: true } });
    if (!c) return { ok: false, error: "client_not_found" };
  }

  const sourceSize = await storedObjectSize(file.fileUrl);
  if (sourceSize === null) {
    if (file.metaStatus !== "missing") {
      await prisma.file.update({ where: { id: file.id }, data: { metaStatus: "missing", metaReadAt: new Date() } }).catch(() => {});
    }
    return { ok: false, error: "source_missing" };
  }

  const storageKey = buildLibraryKey(input.clientId, file.fileName, nanoid(10));
  const copied = await copyStoredObject(file.fileUrl, storageKey);
  if (!copied) return { ok: false, error: "source_missing" };

  // File facts: from the order file when already read, else read the copy now.
  let meta: Pick<
    LibraryFile,
    "sizeBytes" | "pixelWidth" | "pixelHeight" | "dpi" | "widthMm" | "heightMm" | "pageCount"
  > = {
    sizeBytes: file.sizeBytes ?? sourceSize,
    pixelWidth: file.pixelWidth,
    pixelHeight: file.pixelHeight,
    dpi: file.dpi,
    widthMm: file.widthMm,
    heightMm: file.heightMm,
    pageCount: file.pageCount,
  };
  if (!file.metaReadAt) {
    try {
      const m = await readFileMeta(storageKey, file.fileName);
      meta = {
        sizeBytes: m.sizeBytes ?? sourceSize,
        pixelWidth: m.pixelWidth,
        pixelHeight: m.pixelHeight,
        dpi: m.dpi,
        widthMm: m.widthMm,
        heightMm: m.heightMm,
        pageCount: file.pageCount ?? m.pageCount,
      };
    } catch (error) {
      console.error("library: meta read failed", storageKey, error);
    }
  }

  const title = (input.title ?? "").trim().slice(0, LIBRARY_TITLE_MAX) || defaultLibraryTitle(file.fileName);
  const row = await prisma.libraryFile.create({
    data: {
      clientId: input.clientId,
      title,
      tags: normalizeLibraryTags(input.tags),
      storageKey,
      fileName: file.fileName,
      ...meta,
      sourceOrderId: file.orderId,
      sourceFileId: file.id,
      createdById: input.actorId,
    },
    include: { client: { select: LIBRARY_CLIENT_SELECT } },
  });
  return { ok: true, item: serializeLibraryFile(row, await librarySourceOrderNumber(file.orderId)) };
}

/** Order files a library key is used by (any order, trash included). */
export async function libraryKeyReferenceCount(storageKey: string): Promise<number> {
  return prisma.file.count({ where: { fileUrl: storageKey } });
}

/**
 * Hard delete: object + row, only when no order file references the key
 * (an order made from it still needs the file). Otherwise use «В архив».
 */
export async function hardDeleteLibraryFile(
  id: string,
): Promise<{ ok: true } | { ok: false; error: "not_found" | "in_use"; references?: number }> {
  const row = await prisma.libraryFile.findUnique({ where: { id } });
  if (!row) return { ok: false, error: "not_found" };
  const references = await libraryKeyReferenceCount(row.storageKey);
  if (references > 0) return { ok: false, error: "in_use", references };
  await prisma.libraryFile.delete({ where: { id } });
  if (isLibraryKey(row.storageKey)) await deleteLibraryObject(row.storageKey);
  const thumbs = libraryThumbKeys(row.id);
  await Promise.all([deleteLibraryObject(thumbs.thumb), deleteLibraryObject(thumbs.none)]).catch((error) =>
    console.error("library: thumb delete failed", row.id, error),
  );
  return { ok: true };
}

/** Search filter shared by the library page and the wizard picker. */
export function librarySearchWhere(search: string): Prisma.LibraryFileWhereInput | null {
  const q = search.trim();
  if (!q) return null;
  const tag = q.replace(/^#+/, "").toLowerCase();
  return {
    OR: [
      { title: { contains: q, mode: "insensitive" } },
      { fileName: { contains: q, mode: "insensitive" } },
      { tags: { has: tag } },
      { client: { personName: { contains: q, mode: "insensitive" } } },
      { client: { companyName: { contains: q, mode: "insensitive" } } },
      { client: { phone: { contains: q, mode: "insensitive" } } },
      ...libraryPhoneSearchDigits(q).flatMap((d) => [
        { client: { phoneNormalized: { contains: d } } },
        { client: { phone: { contains: d } } },
      ]),
    ],
  };
}
