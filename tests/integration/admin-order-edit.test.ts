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

  it("PATCH keeps mug files on mug line including newly added uploads", async () => {
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

    const mugFiles = await prisma.file.findMany({
      where: { orderLineId: mugLineId },
      orderBy: { fileName: "asc" },
    });
    expect(mugFiles.length).toBe(2);
    const extra = mugFiles.find((f) => f.fileName === "extra.png");
    expect(extra?.orderLineId).toBe(mugLineId);

    await prisma.order.deleteMany({ where: { id: created.id } });
    await cleanupMugProducts([mug.id]);
  });
});
