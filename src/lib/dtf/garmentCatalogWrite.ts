import { Prisma } from "@prisma/client";
import type { CreateGarmentInput, UpdateGarmentInput } from "@/lib/dtf/dtfAdminSchemas";
import { prisma } from "@/lib/prisma";

type Tx = Prisma.TransactionClient;

export class GarmentSizeInUseError extends Error {
  readonly code = "dtf_size_in_use" as const;
  constructor(public readonly size: string) {
    super("dtf_size_in_use");
    this.name = "GarmentSizeInUseError";
  }
}

function decimalOrNull(value: number | null | undefined): Prisma.Decimal | null {
  return value == null ? null : new Prisma.Decimal(value.toFixed(2));
}

export async function createGarmentProduct(input: CreateGarmentInput): Promise<string> {
  const created = await prisma.garmentProduct.create({
    data: {
      kind: input.kind,
      name: input.name,
      colorName: input.colorName,
      colorHex: input.colorHex ?? null,
      purchaseCost: decimalOrNull(input.purchaseCost),
      priceTiers: input.priceTiers as unknown as Prisma.InputJsonValue,
      internalNotes: input.internalNotes ?? null,
      variants: {
        create: input.sizes.map((size, i) => ({ size, sortOrder: i })),
      },
    },
    select: { id: true },
  });
  return created.id;
}

/**
 * Bring the size list in line with `sizes`: keep existing rows (re-ordered),
 * add new ones, drop unused ones. A size with stock or history stays.
 */
async function syncGarmentSizes(tx: Tx, garmentProductId: string, sizes: string[]): Promise<void> {
  const existing = await tx.garmentVariant.findMany({
    where: { garmentProductId },
    include: { _count: { select: { movements: true, receipts: true } } },
  });
  const wanted = new Map(sizes.map((s, i) => [s.toUpperCase(), { size: s, sortOrder: i }]));

  for (const v of existing) {
    const keep = wanted.get(v.size.toUpperCase());
    if (keep) {
      await tx.garmentVariant.update({ where: { id: v.id }, data: { sortOrder: keep.sortOrder } });
      wanted.delete(v.size.toUpperCase());
      continue;
    }
    if (v.stockQuantity !== 0 || v._count.movements > 0 || v._count.receipts > 0) {
      throw new GarmentSizeInUseError(v.size);
    }
    await tx.garmentVariant.delete({ where: { id: v.id } });
  }
  for (const add of wanted.values()) {
    await tx.garmentVariant.create({ data: { garmentProductId, ...add } });
  }
}

export async function updateGarmentProduct(id: string, input: UpdateGarmentInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.garmentProduct.update({
      where: { id },
      data: {
        kind: input.kind,
        name: input.name,
        colorName: input.colorName,
        colorHex: input.colorHex,
        purchaseCost:
          input.purchaseCost === undefined ? undefined : decimalOrNull(input.purchaseCost),
        priceTiers:
          input.priceTiers === undefined
            ? undefined
            : (input.priceTiers as unknown as Prisma.InputJsonValue),
        internalNotes: input.internalNotes,
        isActive: input.isActive,
        sortOrder: input.sortOrder,
      },
    });
    if (input.sizes) await syncGarmentSizes(tx, id, input.sizes);
  });
}
