import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LF_ROLL_WIDTH_MAX_METERS } from "@/lib/largeFormat/lfSheet";
import { buildRollLayoutPdfBuffer, buildSheetLayoutPdfBuffer } from "@/lib/largeFormat/rollLayoutPdf";
import { loadLfSheetSpecs } from "@/lib/largeFormat/lfSheetSpecs";
import { resolveGalleryWrapCm } from "@/lib/largeFormat/lfLayoutBorder";
import { readOrderFileBuffer } from "@/lib/largeFormat/readOrderFileBuffer";
import { storeRollLayoutPdf } from "@/lib/largeFormat/storeRollLayoutPdf";
import { buildRollLayoutPdfFileName } from "@/lib/largeFormat/rollLayoutPdfFileName";

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

const tilesSchema = z
  .array(
    z.object({
      tileId: z.string().min(1),
      fileId: z.string().min(1),
    }),
  )
  .min(1);

const rollBodySchema = z.object({
  materialLabel: z.string().min(1).max(200),
  /** Listed in the downloaded file name. Optional for older clients. */
  orderNumbers: z.array(z.number().int()).max(500).optional(),
  // A roll is at most LF_ROLL_WIDTH_MAX_METERS wide (a «5500 cm» width is a cm-as-metres mistake).
  printableWidthCm: z.number().finite().positive().max(LF_ROLL_WIDTH_MAX_METERS * 100),
  totalAlongCm: z.number().finite().positive(),
  placements: z.array(placementSchema).min(1),
  tiles: tilesSchema,
});

/**
 * Sheet layout (VATMAN A1): pieces per sheet, one PDF page per sheet. The page
 * size is the material's sheet size read on the server, never the client's.
 */
const sheetBodySchema = z.object({
  layout: z.literal("sheet"),
  materialLabel: z.string().min(1).max(200),
  orderNumbers: z.array(z.number().int()).max(500).optional(),
  sheets: z.array(z.array(placementSchema).min(1)).min(1).max(500),
  tiles: tilesSchema,
});

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

  if (body && typeof body === "object" && (body as { layout?: unknown }).layout === "sheet") {
    return postSheetLayout(body);
  }

  const parsed = rollBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const {
    materialLabel,
    orderNumbers,
    printableWidthCm,
    totalAlongCm,
    placements,
    tiles,
  } = parsed.data;

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
    select: {
      id: true,
      fileName: true,
      fileUrl: true,
      orderLine: {
        select: { productionStatus: true, largeFormatMaterial: { select: { materialForm: true } } },
      },
    },
  });
  // Sheet materials (VATMAN A1) are printed sheet by sheet, never on a roll layout —
  // also lines priced while the material was still a roll.
  if (files.some((f) => f.orderLine.largeFormatMaterial?.materialForm === "sheet")) {
    return NextResponse.json({ error: "material_is_sheet" }, { status: 409 });
  }
  // «Нужен макет» lines are never laid out (the planner does not offer them either).
  if (files.some((f) => f.orderLine.productionStatus === "NEEDS_LAYOUT")) {
    return NextResponse.json({ error: "line_needs_layout" }, { status: 409 });
  }
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

    const fileName = buildRollLayoutPdfFileName(materialLabel, orderNumbers ?? []);

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

async function postSheetLayout(body: unknown) {
  const parsed = sheetBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { materialLabel, orderNumbers, sheets, tiles } = parsed.data;

  const placements = sheets.flat();
  const placementIds = new Set(placements.map((p) => p.tileId));
  for (const tileId of new Set(tiles.map((t) => t.tileId))) {
    if (!placementIds.has(tileId)) {
      return NextResponse.json({ error: `Tile ${tileId} has no placement` }, { status: 400 });
    }
  }

  const fileIds = [...new Set(tiles.map((t) => t.fileId))];
  const files = await prisma.file.findMany({
    where: { id: { in: fileIds } },
    select: {
      id: true,
      fileName: true,
      fileUrl: true,
      orderLine: {
        select: { productionStatus: true, largeFormatMaterialId: true },
      },
    },
  });
  if (files.length !== fileIds.length) {
    return NextResponse.json({ error: "file_not_found" }, { status: 404 });
  }
  // One sheet material per layout; roll materials keep their roll layout.
  const materialIds = new Set(files.map((f) => f.orderLine.largeFormatMaterialId ?? ""));
  const specs = await loadLfSheetSpecs(prisma, materialIds);
  if (files.some((f) => !f.orderLine.largeFormatMaterialId || !specs.has(f.orderLine.largeFormatMaterialId))) {
    return NextResponse.json({ error: "material_is_roll" }, { status: 409 });
  }
  const sizes = new Set([...specs.values()].map((sp) => `${sp.sheetWidthCm}x${sp.sheetHeightCm}`));
  if (sizes.size !== 1) {
    return NextResponse.json({ error: "mixed_sheet_sizes" }, { status: 409 });
  }
  if (files.some((f) => f.orderLine.productionStatus === "NEEDS_LAYOUT")) {
    return NextResponse.json({ error: "line_needs_layout" }, { status: 409 });
  }
  const spec = [...specs.values()][0]!;
  const EPS = 1e-3;
  if (
    placements.some(
      (p) => p.xCm + p.widthCm > spec.sheetWidthCm + EPS || p.yCm + p.heightCm > spec.sheetHeightCm + EPS,
    )
  ) {
    return NextResponse.json({ error: "placement_outside_sheet" }, { status: 400 });
  }

  const fileMap = new Map(files.map((f) => [f.id, f]));
  const tileToFileId = new Map(tiles.map((t) => [t.tileId, t.fileId]));
  const bufferByFileId = new Map<string, Buffer>();
  const galleryWrapCm = resolveGalleryWrapCm(materialLabel);
  const galleryWrapCmByTileId =
    galleryWrapCm > 0 ? new Map(placements.map((p) => [p.tileId, galleryWrapCm])) : undefined;

  try {
    const pdfBytes = await buildSheetLayoutPdfBuffer({
      sheetWidthCm: spec.sheetWidthCm,
      sheetHeightCm: spec.sheetHeightCm,
      sheets,
      galleryWrapCmByTileId,
      getAsset: async (tileId) => {
        const fileId = tileToFileId.get(tileId);
        if (!fileId) throw new Error(`No file mapped for tile ${tileId}`);
        const file = fileMap.get(fileId);
        if (!file) throw new Error(`File not found: ${fileId}`);
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
    const fileName = buildRollLayoutPdfFileName(materialLabel, orderNumbers ?? []);
    const stored = await storeRollLayoutPdf(pdfBytes, fileName);
    return NextResponse.json(stored);
  } catch (error) {
    console.error("POST /api/workshop-board/layout-pdf (sheet):", error);
    const message = error instanceof Error ? error.message : "Failed to build layout PDF";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
