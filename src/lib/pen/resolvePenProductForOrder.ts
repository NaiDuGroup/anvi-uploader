import { prisma } from "@/lib/prisma";

export async function resolvePenProductForOrder(penProductId: string) {
  return prisma.penProduct.findUnique({
    where: { id: penProductId, isActive: true },
  });
}
