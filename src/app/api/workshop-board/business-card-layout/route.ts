import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readOrderFileBuffer } from "@/lib/largeFormat/readOrderFileBuffer";
import {
  storeLayoutFile,
  type StoredLayoutFile,
} from "@/lib/largeFormat/storeRollLayoutPdf";
import { businessCardFaces } from "@/lib/businessCard/businessCardConstants";
import { businessCardLayoutFromPersisted } from "@/lib/businessCard/businessCardSheetLayout";
import {
  BUSINESS_CARD_ARTWORK_NOT_RASTER,
  buildBusinessCardSheetPngs,
  type BusinessCardSheetSide,
} from "@/lib/businessCard/businessCardSheetPng";
import {
  buildBusinessCardLayoutZip,
  type BusinessCardLayoutZipEntry,
} from "@/lib/businessCard/businessCardLayoutZip";
import { parseBusinessCardLineData } from "@/lib/businessCard/parseBusinessCardLineData";

export const runtime = "nodejs";
/** 300 DPI rasterisation of up to two full sheets. */
export const maxDuration = 300;

const bodySchema = z.object({
  orderLineId: z.string().uuid(),
});

type SideLabel = "front" | "back";

/** Transliterated so the names survive any print-shop file system. */
const SIDE_FILE_SUFFIX: Record<SideLabel, string> = {
  front: "litso",
  back: "oborot",
};

/**
 * Build the business-card imposition sheets for one order line: one PNG per
 * printed side, the customer's single card artwork repeated across the centred
 * grid with one cut line around the whole block, packed into a ZIP whose only
 * folder is named after the order number. Geometry comes from the grid
 * frozen on the order line, so the sheet matches what the order was priced with.
 */
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
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const line = await prisma.orderLine.findUnique({
    where: { id: parsed.data.orderLineId },
    select: {
      id: true,
      productType: true,
      businessCardLineData: true,
      order: { select: { orderNumber: true } },
      files: {
        select: { id: true, fileName: true, fileUrl: true, paperType: true },
      },
    },
  });

  if (!line || line.productType !== "business_card") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const data = parseBusinessCardLineData(line.businessCardLineData);
  if (!data) {
    return NextResponse.json(
      { error: "business_card_line_data_missing" },
      { status: 409 },
    );
  }

  const layout = businessCardLayoutFromPersisted({
    sheetWidthCm: data.paperSnapshot.sheetWidthCm,
    sheetHeightCm: data.paperSnapshot.sheetHeightCm,
    ...data.layout,
  });
  if (layout.cardsPerSheet === 0) {
    return NextResponse.json(
      { error: "business_card_layout_card_does_not_fit" },
      { status: 409 },
    );
  }

  // Files carry no sort column: the side tags decide print order.
  const { front, back } = businessCardFaces(line.files);

  if (!front) {
    return NextResponse.json({ error: "business_card_no_artwork" }, { status: 409 });
  }
  if (data.sides === "two" && !back) {
    return NextResponse.json(
      { error: "business_card_back_artwork_missing" },
      { status: 409 },
    );
  }

  // The reverse is always turned 180° so it registers with the front once the
  // press flips the sheet.
  const wanted: Array<{
    label: SideLabel;
    file: (typeof line.files)[number];
    rotateDeg: 0 | 180;
  }> =
    data.sides === "two"
      ? [
          { label: "front", file: front, rotateDeg: 0 },
          { label: "back", file: back!, rotateDeg: 180 },
        ]
      : [{ label: "front", file: front, rotateDeg: 0 }];

  try {
    const sides: BusinessCardSheetSide[] = [];
    for (const { label, file, rotateDeg } of wanted) {
      const buffer = await readOrderFileBuffer(file.fileUrl);
      if (!buffer || buffer.byteLength === 0) {
        throw new Error(`Could not load file: ${file.fileName}`);
      }
      sides.push({ label, fileName: file.fileName, buffer, rotateDeg });
    }

    const sheets = await buildBusinessCardSheetPngs({ layout, sides });

    const orderNumber = line.order?.orderNumber ?? "order";
    // Run size in the name so the workshop can check the sheet count at a glance.
    const baseName = `vizitki-${orderNumber}-${data.quantity}sht-${data.sheetsUsed}listov`;
    const singleSide = sheets.length === 1;

    const entries: BusinessCardLayoutZipEntry[] = sheets.map(({ png }, index) => {
      const label: SideLabel = wanted[index]!.label;
      const suffix = singleSide ? "" : `-${SIDE_FILE_SUFFIX[label]}`;
      return { name: `${baseName}${suffix}.png`, data: png };
    });
    const zip = await buildBusinessCardLayoutZip(String(orderNumber), entries);
    const stored: StoredLayoutFile = await storeLayoutFile(
      zip,
      `${baseName}.zip`,
      "application/zip",
    );
    return NextResponse.json(stored);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to build layout";
    if (message === BUSINESS_CARD_ARTWORK_NOT_RASTER) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    console.error("POST /api/workshop-board/business-card-layout:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
