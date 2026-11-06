import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadDtfSettings } from "@/lib/dtf/resolveDtfLine";
import { loadUvSettings } from "@/lib/uv/resolveUvLine";
import {
  buildDtfFilmPdf,
  buildFilmPng,
  buildDtfFilmPreview,
  planDtfFilm,
  type DtfFilmFile,
} from "@/lib/dtf/dtfFilmJob";
import { readOrderFileBuffer } from "@/lib/largeFormat/readOrderFileBuffer";
import { storeLayoutFile, storeRollLayoutPdf } from "@/lib/largeFormat/storeRollLayoutPdf";
import { buildRollLayoutPdfFileName } from "@/lib/largeFormat/rollLayoutPdfFileName";

export const runtime = "nodejs";
export const maxDuration = 300;

const bodySchema = z.object({
  /** "preview" → layout picture and stats; "pdf" → print file download URL. */
  mode: z.enum(["preview", "pdf"]),
  /** DTF transfers (default) or UV-DTF stickers: same nesting, the UV-DTF film width and gap. */
  method: z.enum(["dtf", "uv_dtf"]).default("dtf"),
  orderNumbers: z.array(z.number().int()).max(500).optional(),
  /** Operator-chosen gap between transfer outlines (mm); the method's setting when omitted. */
  gapMm: z.number().finite().min(0).max(50).optional(),
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
  const { mode, method, orderNumbers, transfers, gapMm } = parsed.data;

  const fileIds = [...new Set(transfers.map((t) => t.fileId))];
  const [film, files] = await Promise.all([
    method === "uv_dtf"
      ? loadUvSettings().then((s) => ({
          printableWidthCm: s.uvDtfPrintableWidthCm,
          layoutGapMm: s.uvDtfGapCm * 10,
          // The UV printer lays white exactly under the colour.
          whiteChokeMm: 0,
        }))
      : loadDtfSettings(),
    prisma.file.findMany({
      where: { id: { in: fileIds } },
      select: { id: true, fileName: true, fileUrl: true, orderLine: { select: { productionStatus: true } } },
    }),
  ]);
  // «Нужен макет» lines are never laid out (the board does not offer them either).
  if (files.some((f) => f.orderLine.productionStatus === "NEEDS_LAYOUT")) {
    return NextResponse.json({ error: "line_needs_layout" }, { status: 409 });
  }
  const fileById = new Map(files.map((f) => [f.id, f]));
  const layoutGapMm: number = gapMm ?? film.layoutGapMm;

  try {
    const job = await planDtfFilm({
      transfers,
      filmWidthCm: film.printableWidthCm,
      layoutGapMm,
      whiteChokeMm: film.whiteChokeMm,
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
        gapMm: layoutGapMm,
        previewDataUrl: preview ? `data:image/webp;base64,${preview.toString("base64")}` : null,
      });
    }

    if (job.unplaced.length > 0 || job.placements.length === 0) {
      return NextResponse.json({ error: "dtf_film_has_unplaced", unplaced: job.unplaced }, { status: 422 });
    }
    const fileName: string = buildRollLayoutPdfFileName(method === "uv_dtf" ? "UV-DTF" : "DTF", orderNumbers ?? []);
    if (method === "uv_dtf") {
      // The UV printer reads PNG: transparent film, white is laid by the printer.
      if (job.vectorPdfCount > 0) {
        return NextResponse.json({ error: "uv_dtf_vector_artwork" }, { status: 422 });
      }
      const png = await buildFilmPng(job);
      return NextResponse.json(await storeLayoutFile(png, fileName.replace(/\.pdf$/, ".png"), "image/png"));
    }
    const pdf = await buildDtfFilmPdf(job);
    const stored = await storeRollLayoutPdf(pdf, fileName);
    return NextResponse.json(stored);
  } catch (error) {
    console.error("POST /api/workshop-board/dtf-film:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to build DTF film" },
      { status: 500 },
    );
  }
}
