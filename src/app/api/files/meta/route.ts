import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readFileMeta } from "@/lib/files/fileMeta";
import type { FileMetaJson } from "@/lib/files/fileMetaFormat";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(200) });
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
} as const;

/**
 * Weight, pixels, dpi and print size of uploaded files. Read from storage the
 * first time a file is asked for, then served from the database.
 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const files = await prisma.file.findMany({ where: { id: { in: [...new Set(parsed.data.ids)] } }, select: SELECT });
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
    };
  }
  return NextResponse.json({ meta });
}
