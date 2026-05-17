import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type SeedFileRow = {
  fileName: string;
  fileUrl: string;
  copies: number;
  color: string;
  paperType?: string | null;
  pageCount?: number | null;
};

/** Integration tests: create `Order` + one `OrderLine` + files. */
export async function seedOrderWithFiles(
  orderData: Prisma.OrderUncheckedCreateInput,
  files: SeedFileRow[],
) {
  const o = await prisma.order.create({
    data: orderData,
  });
  const productType =
    typeof orderData.productType === "string"
      ? orderData.productType
      : "paper_print";
  await prisma.orderLine.create({
    data: {
      orderId: o.id,
      sortOrder: 0,
      productType,
      mugLayoutData: orderData.mugLayoutData ?? undefined,
      mugProductId: orderData.mugProductId ?? undefined,
      mugProductSnapshot: orderData.mugProductSnapshot ?? undefined,
      notebookLayoutData: orderData.notebookLayoutData ?? undefined,
      notebookProductId: orderData.notebookProductId ?? undefined,
      notebookProductSnapshot: orderData.notebookProductSnapshot ?? undefined,
      files: {
        create: files.map((f) => ({
          orderId: o.id,
          fileName: f.fileName,
          fileUrl: f.fileUrl,
          copies: f.copies,
          color: f.color,
          paperType: f.paperType ?? null,
          pageCount: f.pageCount ?? null,
        })),
      },
    },
  });
  return prisma.order.findUniqueOrThrow({
    where: { id: o.id },
    include: {
      files: true,
      orderLines: {
        orderBy: { sortOrder: "asc" },
        include: { files: true },
      },
    },
  });
}
