import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readOrderFileBuffer } from "@/lib/largeFormat/readOrderFileBuffer";
import { storeRollLayoutPdf } from "@/lib/largeFormat/storeRollLayoutPdf";
import {
  BUSINESS_CARD_BACK_PAPER_TYPE,
  BUSINESS_CARD_FRONT_PAPER_TYPE,
} from "@/lib/businessCard/businessCardConstants";
import { businessCardLayoutFromPersisted } from "@/lib/businessCard/businessCardSheetLayout";
import {
  buildBusinessCardSheetPdfBuffer,
  type BusinessCardSheetSide,
} from "@/lib/businessCard/businessCardSheetPdf";
import { parseBusinessCardLineData } from "@/lib/businessCard/parseBusinessCardLineData";

export const runtime = "nodejs";
/** 300 DPI rasterisation of up to two full sheets. */
export const maxDuration = 300;

const bodySchema = z.object({
  orderLineId: z.string().uuid(),
});

/**
 * Build the business-card imposition sheet for one order line: the customer's
 * single card artwork repeated across the centred grid with grey cut lines, one
 * page per printed side. Geometry comes from the grid frozen on the order line,
 * so the sheet matches what the order was priced with.
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
      { error: "business_card_pdf_card_does_not_fit" },
      { status: 409 },
    );
  }

  // Files carry no sort column: the side tags decide page order, and an
  // untagged pair falls back to the stable id order it was created in.
  const byId = [...line.files].sort((a, b) => a.id.localeCompare(b.id));
  const front =
    byId.find((f) => f.paperType === BUSINESS_CARD_FRONT_PAPER_TYPE) ?? byId[0];
  const back =
    byId.find((f) => f.paperType === BUSINESS_CARD_BACK_PAPER_TYPE) ??
    byId.find((f) => f.id !== front?.id);

  if (!front) {
    return NextResponse.json({ error: "business_card_no_artwork" }, { status: 409 });
  }
  if (data.sides === "two" && !back) {
    return NextResponse.json(
      { error: "business_card_back_artwork_missing" },
      { status: 409 },
    );
  }

  const wanted =
    data.sides === "two"
      ? [
          { label: "front", file: front },
          { label: "back", file: back! },
        ]
      : [{ label: "front", file: front }];

  try {
    const sides: BusinessCardSheetSide[] = [];
    for (const { label, file } of wanted) {
      const buffer = await readOrderFileBuffer(file.fileUrl);
      if (!buffer || buffer.byteLength === 0) {
        throw new Error(`Could not load file: ${file.fileName}`);
      }
      sides.push({ label, fileName: file.fileName, buffer });
    }

    const pdfBytes = await buildBusinessCardSheetPdfBuffer({ layout, sides });

    const orderNumber = line.order?.orderNumber ?? "order";
    const fileName = `vizitki-${orderNumber}-${new Date()
      .toISOString()
      .slice(0, 10)}.pdf`;

    // Vercel caps function response bodies (~4.5 MB); store and hand back a URL.
    const stored = await storeRollLayoutPdf(pdfBytes, fileName);
    return NextResponse.json(stored);
  } catch (error) {
    console.error("POST /api/workshop-board/business-card-layout-pdf:", error);
    const message =
      error instanceof Error ? error.message : "Failed to build layout PDF";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
