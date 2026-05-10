import { prisma } from "@/lib/prisma";
import type { NotebookProduct } from "@prisma/client";

/**
 * SKU may be ordered only if it is active in the catalog.
 */
export async function resolveNotebookProductForOrder(
  productId: string,
): Promise<NotebookProduct | null> {
  return prisma.notebookProduct.findFirst({
    where: {
      id: productId,
      isActive: true,
    },
  });
}
