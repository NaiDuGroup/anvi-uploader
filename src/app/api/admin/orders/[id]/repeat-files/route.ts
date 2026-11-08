import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireLibraryStaff } from "@/lib/library/libraryAuth";
import { isLibraryKey } from "@/lib/library/libraryKeys";
import { storedObjectSize } from "@/lib/library/libraryStorage";

export const runtime = "nodejs";

export type RepeatFileSource = "library" | "storage" | "link";

export interface RepeatFileJson {
  fileName: string;
  /** Key / link the new order reuses as `File.fileUrl` (no copy). */
  fileUrl: string;
  source: RepeatFileSource;
  libraryFileId: string | null;
  /** Library items: title and file facts shown on the wizard row. */
  library?: {
    title: string;
    sizeBytes: number | null;
    pixelWidth: number | null;
    pixelHeight: number | null;
    dpi: number | null;
    widthMm: number | null;
    heightMm: number | null;
    pageCount: number | null;
  };
}

const PARALLEL = 6;

/**
 * «Повторить заказ»: for each file of the order, what the new order can reuse.
 * - a library item saved from that file (or the file already is a library key) → its key;
 * - otherwise the stored object while it still exists (`uploads/…` may expire soon);
 * - http(s) links as they are.
 * `files[fileId] = null` → the file is gone: «файл нужно загрузить заново».
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { denied } = await requireLibraryStaff();
  if (denied) return denied;
  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    select: { id: true, files: { select: { id: true, fileUrl: true, fileName: true } } },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const ids = order.files.map((f) => f.id);
  const libKeys = order.files.filter((f) => isLibraryKey(f.fileUrl)).map((f) => f.fileUrl);
  const lib = ids.length
    ? await prisma.libraryFile.findMany({
        where: {
          archivedAt: null,
          OR: [{ sourceFileId: { in: ids } }, ...(libKeys.length ? [{ storageKey: { in: libKeys } }] : [])],
        },
        select: {
          id: true,
          storageKey: true,
          sourceFileId: true,
          fileName: true,
          title: true,
          sizeBytes: true,
          pixelWidth: true,
          pixelHeight: true,
          dpi: true,
          widthMm: true,
          heightMm: true,
          pageCount: true,
        },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const files: Record<string, RepeatFileJson | null> = {};
  const toCheck: Array<{ id: string; fileUrl: string; fileName: string }> = [];
  for (const f of order.files) {
    const hit = lib.find((l) => l.storageKey === f.fileUrl) ?? lib.find((l) => l.sourceFileId === f.id);
    if (hit) {
      const { title, sizeBytes, pixelWidth, pixelHeight, dpi, widthMm, heightMm, pageCount } = hit;
      files[f.id] = {
        fileName: f.fileName,
        fileUrl: hit.storageKey,
        source: "library",
        libraryFileId: hit.id,
        library: { title, sizeBytes, pixelWidth, pixelHeight, dpi, widthMm, heightMm, pageCount },
      };
    } else if (/^https?:\/\//i.test(f.fileUrl)) {
      files[f.id] = { fileName: f.fileName, fileUrl: f.fileUrl, source: "link", libraryFileId: null };
    } else {
      toCheck.push(f);
    }
  }
  for (let i = 0; i < toCheck.length; i += PARALLEL) {
    await Promise.all(
      toCheck.slice(i, i + PARALLEL).map(async (f) => {
        let size: number | null = null;
        try {
          size = await storedObjectSize(f.fileUrl);
        } catch (error) {
          console.error("repeat-files: HEAD failed", f.id, error);
        }
        files[f.id] = size === null ? null : { fileName: f.fileName, fileUrl: f.fileUrl, source: "storage", libraryFileId: null };
      }),
    );
  }
  return NextResponse.json({ files });
}
