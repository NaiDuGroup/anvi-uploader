import { prisma } from "@/lib/prisma";
import type { MugProduct } from "@prisma/client";

/**
 * SKU may be ordered only if it is active in the catalog.
 */
export async function resolveMugProductForOrder(
  productId: string,
): Promise<MugProduct | null> {
  return prisma.mugProduct.findFirst({
    where: {
      id: productId,
      isActive: true,
    },
  });
}
