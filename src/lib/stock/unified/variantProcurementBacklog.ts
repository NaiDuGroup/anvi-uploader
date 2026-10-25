import type { Prisma } from "@prisma/client";
import { allocateMugVariantProcurementBacklog } from "@/lib/mug/mugOrderStock";
import { allocateNotebookVariantProcurementBacklog } from "@/lib/notebook/notebookOrderStock";
import { allocatePenVariantProcurementBacklog } from "@/lib/pen/penOrderStock";
import { allocateMaterialProcurementBacklog } from "./materialOrderStock";

/**
 * After a receipt on a unified variant: mug / pen / notebook / wide-format roll /
 * sheet paper orders that waited for it take their stock now (no-op for
 * variants no order waits for).
 */
export async function allocateVariantProcurementBacklog(
  tx: Prisma.TransactionClient,
  params: { variantId: string; createdById: string | null },
): Promise<void> {
  await allocatePenVariantProcurementBacklog(tx, params);
  await allocateNotebookVariantProcurementBacklog(tx, params);
  await allocateMugVariantProcurementBacklog(tx, params);
  await allocateMaterialProcurementBacklog(tx, params);
}
