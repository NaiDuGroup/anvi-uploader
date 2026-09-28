/**
 * Admin PATCH /api/admin/orders/[id]: mixed paper + mug lines, file sync and line targeting.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { baseUrl, login, TEST_ADMIN } from "./helpers";

const shouldRun = Boolean(
  process.env.TEST_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL,
);

const minimalMugLayout = {
  templateId: "text_photo" as const,
  text: "",
  fontFamily: "Roboto",
  textColor: "#000000",
  backgroundColor: "transparent",
  photoUrls: [] as string[],
  photoSettings: [] as Array<{
    fitMode: "cover" | "contain";
    alignment: "left" | "center" | "right";
  }>,
};

describe.skipIf(!shouldRun)("integration: admin order PATCH (mixed edit)", () => {
  let adminCookie: string;

  beforeAll(async () => {
    const a = await login(TEST_ADMIN.name, TEST_ADMIN.password);
    adminCookie = a.cookie;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createActiveMugSku(stockQuantity: number) {
    const sku = `IT-EDIT-${Date.now()}-${nanoid(6)}`;
    return prisma.mugProduct.create({
      data: {
        sku,
        nameRo: "IT",
        nameRu: "IT",
        nameEn: "IT",
        stockQuantity,
        isActive: true,
      },
    });
  }

  async function cleanupMugProducts(ids: string[]) {
    for (const id of ids) {
      await prisma.mugStockMovement.deleteMany({ where: { mugProductId: id } });
      await prisma.mugProduct.deleteMany({ where: { id } });
    }
  }

  /**
   * When PATCH sends multiple files under a single mug line, the server
   * expands each file into its own order line
   * (`expandToOneFilePerLine` in `adminOrderCreateHelpers.ts`, adopted in
   * commit `ca87954`). The first file inherits the incoming `orderLineId`;
   * subsequent files each create a new mug line with the same
   * `mugProductId`. This test locks that behaviour end-to-end.
   */
  it("PATCH expands multi-file mug payload into one mug line per file", async () => {
    const mug = await createActiveMugSku(80);
    const phone = `+3738${Date.now().toString().slice(-8)}`;

    const createRes = await fetch(`${baseUrl()}/api/admin/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        phone,
        lines: [
          {
            productType: "paper_print",
            files: [
              {
                fileName: "doc.pdf",
                fileUrl: "uploads/it-edit-paper",
                copies: 2,
                color: "bw",
                paperType: "A4",
                pageCount: 3,
              },
            ],
          },
          {
            productType: "mug",
            mugProductId: mug.id,
            mugLayoutData: minimalMugLayout,
            files: [
              {
                fileName: "mug.png",
                fileUrl: "uploads/it-edit-mug",
                copies: 3,
                color: "color",
              },
            ],
          },
        ],
      }),
    });

    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as {
      id: string;
      orderLines: Array<{ id: string; productType: string; files: Array<{ id: string }> }>;
    };

    const paperLine = created.orderLines.find((l) => l.productType === "paper_print");
    const mugLine = created.orderLines.find((l) => l.productType === "mug");
    expect(paperLine?.files[0]?.id).toBeTruthy();
    expect(mugLine?.files[0]?.id).toBeTruthy();

    const paperFileId = paperLine!.files[0]!.id;
    const mugFileId = mugLine!.files[0]!.id;
    const mugLineId = mugLine!.id;

    const patchRes = await fetch(`${baseUrl()}/api/admin/orders/${created.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        phone,
        lines: [
          {
            orderLineId: paperLine!.id,
            productType: "paper_print",
            files: [{ fileId: paperFileId, copies: 11 }],
          },
          {
            orderLineId: mugLineId,
            productType: "mug",
            mugProductId: mug.id,
            mugLayoutData: minimalMugLayout,
            files: [
              { fileId: mugFileId, copies: 2 },
              {
                fileName: "extra.png",
                fileUrl: "uploads/it-edit-mug-extra",
                copies: 4,
                color: "color",
              },
            ],
          },
        ],
      }),
    });

    expect(patchRes.status).toBe(200);

    const paperDb = await prisma.file.findUnique({ where: { id: paperFileId } });
    expect(paperDb?.copies).toBe(11);

    // Original mug file must stay on its own mug line (first spec inherits
    // the incoming orderLineId).
    const mugFileDb = await prisma.file.findUnique({ where: { id: mugFileId } });
    expect(mugFileDb?.orderLineId).toBe(mugLineId);
    expect(mugFileDb?.fileName).toBe("mug.png");

    // The extra upload must land on a new mug line for the same SKU, not
    // on the paper line and not orphaned.
    const mugLinesAfter = await prisma.orderLine.findMany({
      where: { orderId: created.id, productType: "mug" },
      include: { files: true },
      orderBy: { sortOrder: "asc" },
    });
    expect(mugLinesAfter.length).toBe(2);
    for (const ml of mugLinesAfter) {
      expect(ml.mugProductId).toBe(mug.id);
      expect(ml.files.length).toBe(1);
    }

    const allMugFiles = mugLinesAfter.flatMap((ml) => ml.files);
    const extra = allMugFiles.find((f) => f.fileName === "extra.png");
    expect(extra).toBeTruthy();
    expect(extra?.orderLineId).not.toBe(mugLineId);
    // extra must belong to one of the mug lines, not to the paper line.
    const paperLineIds = new Set(
      (
        await prisma.orderLine.findMany({
          where: { orderId: created.id, productType: "paper_print" },
          select: { id: true },
        })
      ).map((l) => l.id),
    );
    expect(paperLineIds.has(extra!.orderLineId!)).toBe(false);

    await prisma.order.deleteMany({ where: { id: created.id } });
    await cleanupMugProducts([mug.id]);
  });
});
