import { z } from "zod";

/** Body of `POST /api/admin/{mug,notebook,pen}-stock/receipt` — one supplier invoice, many SKUs. */
export const catalogStockReceiptBodySchema = z.object({
  purchasedAt: z.coerce.date(),
  supplier: z.string().max(500).optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
  lines: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().min(1).max(1_000_000),
        totalCostMdl: z.number().min(0).max(999_999_999),
      }),
    )
    .min(1),
});

export type CatalogStockReceiptBody = z.infer<typeof catalogStockReceiptBodySchema>;
export type CatalogStockReceiptLine = CatalogStockReceiptBody["lines"][number];

/** Row of `GET /api/admin/{kind}-products/[id]/receipts`. */
export type CatalogStockReceiptItem = {
  id: string;
  quantity: number;
  totalCostMdl: number;
  unitCostMdl: number;
  purchasedAt: string;
  supplier: string | null;
  note: string | null;
  createdAt: string;
  createdBy: { id: string; name: string } | null;
};

/** Row of `GET /api/admin/{kind}-products/[id]/stock-movements`. */
export type CatalogStockMovementItem = {
  id: string;
  delta: number;
  kind: string;
  orderNumber: number | null;
  costMdl: number | null;
  note: string | null;
  createdAt: string;
};

export function trimmedOrNull(value: string | null | undefined): string | null {
  const t: string = value?.trim() ?? "";
  return t ? t : null;
}
