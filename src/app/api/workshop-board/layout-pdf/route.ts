import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildRollLayoutPdfBuffer } from "@/lib/largeFormat/rollLayoutPdf";
import { resolveGalleryWrapCm } from "@/lib/largeFormat/lfLayoutBorder";
import { readOrderFileBuffer } from "@/lib/largeFormat/readOrderFileBuffer";
import { storeRollLayoutPdf } from "@/lib/largeFormat/storeRollLayoutPdf";

export const runtime = "nodejs";
/** Large 300 DPI banners can take minutes to assemble on the server. */
export const maxDuration = 300;

const placementSchema = z.object({
  tileId: z.string().min(1),
  label: z.string(),
  xCm: z.number().finite().nonnegative(),
  yCm: z.number().finite().nonnegative(),
  widthCm: z.number().finite().positive(),
  heightCm: z.number().finite().positive(),
  rotated: z.boolean(),
});

const bodySchema = z.object({
  materialLabel: z.string().min(1).max(200),
  printableWidthCm: z.number().finite().positive(),
  totalAlongCm: z.number().finite().positive(),
  placements: z.array(placementSchema).min(1),
  tiles: z
    .array(
      z.object({
        tileId: z.string().min(1),
        fileId: z.string().min(1),
      }),
    )
    .min(1),
});

function sanitizeFileName(label: string): string {
  return label
    .replace(/[^\p{L}\p{N}\-_]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "layout";
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "workshop" && user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { materialLabel, printableWidthCm, totalAlongCm, placements, tiles } =
    parsed.data;

  const placementIds = new Set(placements.map((p) => p.tileId));
  const uniqueTileIds = [...new Set(tiles.map((t) => t.tileId))];
  for (const tileId of uniqueTileIds) {
    if (!placementIds.has(tileId)) {
      return NextResponse.json(
        { error: `Tile ${tileId} has no placement` },
        { status: 400 },
      );
    }
  }

  const fileIds = [...new Set(tiles.map((t) => t.fileId))];
  const files = await prisma.file.findMany({
    where: { id: { in: fileIds } },
    select: { id: true, fileName: true, fileUrl: true },
  });
  const fileMap = new Map(files.map((f) => [f.id, f]));

  const tileToFileId = new Map(tiles.map((t) => [t.tileId, t.fileId]));
  const bufferByFileId = new Map<string, Buffer>();

  // Canvas ("Panza din bumbac") mirrors a gallery-wrap margin onto every side;
  // the placement footprint already includes it, so every tile of this group
  // gets the same wrap. Other materials get an empty map (no wrap).
  const galleryWrapCm = resolveGalleryWrapCm(materialLabel);
  const galleryWrapCmByTileId =
    galleryWrapCm > 0
      ? new Map(placements.map((p) => [p.tileId, galleryWrapCm]))
      : undefined;

  try {
    const pdfBytes = await buildRollLayoutPdfBuffer({
      printableWidthCm,
      totalAlongCm,
      placements,
      galleryWrapCmByTileId,
      getAsset: async (tileId) => {
        const fileId = tileToFileId.get(tileId);
        if (!fileId) {
          throw new Error(`No file mapped for tile ${tileId}`);
        }
        const file = fileMap.get(fileId);
        if (!file) {
          throw new Error(`File not found: ${fileId}`);
        }
        let buffer = bufferByFileId.get(fileId);
        if (!buffer) {
          const loaded = await readOrderFileBuffer(file.fileUrl);
          if (!loaded || loaded.byteLength === 0) {
            throw new Error(`Could not load file: ${file.fileName}`);
          }
          buffer = loaded;
          bufferByFileId.set(fileId, buffer);
        }
        return { tileId, fileName: file.fileName, buffer };
      },
      releaseAssets: () => bufferByFileId.clear(),
    });

    const date = new Date().toISOString().slice(0, 10);
    const safeName = sanitizeFileName(materialLabel);
    const fileName = `layout-${safeName}-${date}.pdf`;

    // Vercel caps function response bodies (~4.5 MB); wide-format PDFs are much larger.
    const stored = await storeRollLayoutPdf(pdfBytes, fileName);
    return NextResponse.json(stored);
  } catch (error) {
    console.error("POST /api/workshop-board/layout-pdf:", error);
    const message =
      error instanceof Error ? error.message : "Failed to build layout PDF";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
