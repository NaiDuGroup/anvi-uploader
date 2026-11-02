import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadDtfSettings } from "@/lib/dtf/resolveDtfLine";
import {
  buildDtfFilmPdf,
  buildDtfFilmPreview,
  planDtfFilm,
  type DtfFilmFile,
} from "@/lib/dtf/dtfFilmJob";
import { readOrderFileBuffer } from "@/lib/largeFormat/readOrderFileBuffer";
import { storeRollLayoutPdf } from "@/lib/largeFormat/storeRollLayoutPdf";
import { buildRollLayoutPdfFileName } from "@/lib/largeFormat/rollLayoutPdfFileName";

export const runtime = "nodejs";
export const maxDuration = 300;

const bodySchema = z.object({
  /** "preview" → layout picture and stats; "pdf" → print file download URL. */
  mode: z.enum(["preview", "pdf"]),
  orderNumbers: z.array(z.number().int()).max(500).optional(),
  transfers: z
    .array(
      z.object({
        tileId: z.string().min(1),
        fileId: z.string().min(1),
        widthCm: z.number().finite().positive().max(500),
        heightCm: z.number().finite().positive().max(500),
      }),
    )
    .min(1)
    .max(2000),
});

/**
 * Workshop DTF film: nests the transfers by their real outline (no cut lines,
 * `layoutGapMm` apart) and builds the print PDF with a white spot channel.
 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "workshop" && user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }
  const { mode, orderNumbers, transfers } = parsed.data;

  const fileIds = [...new Set(transfers.map((t) => t.fileId))];
  const [settings, files] = await Promise.all([
    loadDtfSettings(),
    prisma.file.findMany({ where: { id: { in: fileIds } }, select: { id: true, fileName: true, fileUrl: true } }),
  ]);
  const fileById = new Map(files.map((f) => [f.id, f]));

  try {
    const job = await planDtfFilm({
      transfers,
      filmWidthCm: settings.printableWidthCm,
      layoutGapMm: settings.layoutGapMm,
      whiteChokeMm: settings.whiteChokeMm,
      loadFile: async (fileId): Promise<DtfFilmFile | null> => {
        const f = fileById.get(fileId);
        if (!f) return null;
        const buffer = await readOrderFileBuffer(f.fileUrl);
        return buffer && buffer.byteLength > 0 ? { fileName: f.fileName, buffer } : null;
      },
    });

    if (mode === "preview") {
      const preview = job.placements.length > 0 ? await buildDtfFilmPreview(job) : null;
      return NextResponse.json({
        filmWidthCm: job.filmWidthCm,
        lengthCm: job.lengthCm,
        placedCount: job.placements.length,
        unplaced: job.unplaced,
        vectorPdfCount: job.vectorPdfCount,
        gapMm: settings.layoutGapMm,
        previewDataUrl: preview ? `data:image/webp;base64,${preview.toString("base64")}` : null,
      });
    }

    if (job.unplaced.length > 0 || job.placements.length === 0) {
      return NextResponse.json({ error: "dtf_film_has_unplaced", unplaced: job.unplaced }, { status: 422 });
    }
    const pdf = await buildDtfFilmPdf(job);
    const stored = await storeRollLayoutPdf(pdf, buildRollLayoutPdfFileName("DTF", orderNumbers ?? []));
    return NextResponse.json(stored);
  } catch (error) {
    console.error("POST /api/workshop-board/dtf-film:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to build DTF film" },
      { status: 500 },
    );
  }
}
