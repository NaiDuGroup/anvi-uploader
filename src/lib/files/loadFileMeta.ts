import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { businessCardFileFrame } from "@/lib/files/businessCardFileFrame";
import { readFileMeta } from "@/lib/files/fileMeta";
import type { FileMetaJson } from "@/lib/files/fileMetaFormat";

const PARALLEL = 4;

const SELECT = {
  id: true,
  fileUrl: true,
  fileName: true,
  sizeBytes: true,
  pixelWidth: true,
  pixelHeight: true,
  dpi: true,
  widthMm: true,
  heightMm: true,
  pageCount: true,
  metaStatus: true,
  metaReadAt: true,
  paperType: true,
  orderLine: { select: { businessCardLineData: true } },
} as const;

/**
 * Weight, pixels, dpi and print size of the files matching `where`. Read from
 * storage the first time a file is asked for, then served from the database.
 * Callers scope `where` (staff: any file; cabinet: the customer's own orders).
 */
export async function loadFileMeta(
  where: Prisma.FileWhereInput,
): Promise<Record<string, FileMetaJson>> {
  const files = await prisma.file.findMany({ where, select: SELECT });
  const todo = files.filter((f) => !f.metaReadAt);
  for (let i = 0; i < todo.length; i += PARALLEL) {
    await Promise.all(
      todo.slice(i, i + PARALLEL).map(async (f) => {
        try {
          const meta = await readFileMeta(f.fileUrl, f.fileName);
          const data = {
            sizeBytes: meta.sizeBytes,
            pixelWidth: meta.pixelWidth,
            pixelHeight: meta.pixelHeight,
            dpi: meta.dpi,
            widthMm: meta.widthMm,
            heightMm: meta.heightMm,
            pageCount: f.pageCount ?? meta.pageCount,
            metaStatus: meta.metaStatus,
            metaReadAt: new Date(),
          };
          await prisma.file.update({ where: { id: f.id }, data });
          Object.assign(f, data);
        } catch (error) {
          // Storage hiccup: leave it unread so the next view tries again.
          console.error("files/meta:", f.id, error);
        }
      }),
    );
  }

  const meta: Record<string, FileMetaJson> = {};
  for (const f of files) {
    if (!f.metaReadAt) continue;
    meta[f.id] = {
      sizeBytes: f.sizeBytes,
      pixelWidth: f.pixelWidth,
      pixelHeight: f.pixelHeight,
      dpi: f.dpi,
      widthMm: f.widthMm,
      heightMm: f.heightMm,
      pageCount: f.pageCount,
      metaStatus: f.metaStatus,
      card: businessCardFileFrame(f.paperType, f.orderLine.businessCardLineData),
    };
  }
  return meta;
}
