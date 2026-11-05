import "server-only";
import type { Prisma } from "@prisma/client";
import { HEAVY_TX_OPTIONS, prisma } from "@/lib/prisma";
import {
  dealerModifyBlockReason,
  type DealerModifyBlock,
} from "@/lib/dealerOrderModify";
import {
  buildAdminOrderUpdateLineInputs,
  syncAdminOrderStructureInTx,
  type OrderWithLinesAndFiles,
} from "@/lib/adminOrderUpdateHelpers";
import { expandToOneFilePerLine } from "@/lib/adminOrderCreateHelpers";
import { findArtworkLargerThanOrdered } from "@/lib/files/serverArtworkCheck";
import { resolveOrderLines } from "@/lib/orderCreate/orderLines";
import { dealerLineTotalsMdl, dealerOrderTotalMdl } from "@/lib/orderCreate/dealerLinePrices";
import { serializeOrderPrice } from "@/lib/orderPriceDecimal";
import type { AdminOrderLineInput, DealerOrderUpdateInput } from "@/lib/validations";
import { returnMugStockForOrder } from "@/lib/mug/mugOrderStock";
import { returnNotebookStockForOrder } from "@/lib/notebook/notebookOrderStock";
import { returnPenStockForOrder } from "@/lib/pen/penOrderStock";
import { returnPrinterConsumablesForOrder } from "@/lib/stock/unified/printers";
import { returnMaterialStockForOrder } from "@/lib/stock/unified/materialOrderStock";
import { returnDtfStockForOrder } from "@/lib/dtf/dtfOrderStock";
import { returnUvStockForOrder } from "@/lib/uv/uvOrderStock";
import { returnSublimationStockForOrder } from "@/lib/sublimation/sublimationOrderStock";

/**
 * Dealer edit / cancel of an own cabinet order (stage 1). Ownership and the
 * «until printing starts» rule ({@link dealerModifyBlockReason}) are checked
 * twice: once on the loaded order (fast refusal) and again inside the write
 * transaction on the row locked with `SELECT … FOR UPDATE`, so a status
 * change by the staff (or the mug batch) that lands first makes the dealer's
 * write fail cleanly instead of rewriting an order that is being printed.
 */

export type DealerOrderModifyErrorCode =
  /** No such order for this dealer (also another client's order: never revealed). */
  | "not_found"
  /** The order exists but can no longer be changed (see `block`). */
  | "order_locked"
  /** Large-format artwork prints bigger than the ordered size. */
  | "artwork_larger_than_ordered";

export class DealerOrderModifyError extends Error {
  constructor(
    readonly code: DealerOrderModifyErrorCode,
    readonly block: DealerModifyBlock | null = null,
    readonly detail?: string,
  ) {
    super(code);
    this.name = "DealerOrderModifyError";
  }
}

export interface DealerActor {
  /** `User.id` of the dealer's portal account. */
  userId: string;
  /** The dealer's `StudioCustomer.id`: only orders with this `clientId` are theirs. */
  studioCustomerId: string;
}

/** Test seams for race tests: run inside the write transaction around the row lock. */
export interface DealerModifyHooks {
  /** After the fast pre-check, before `SELECT … FOR UPDATE`. */
  beforeLock?: () => Promise<void>;
  /** Right after the row is locked and re-checked. */
  afterLock?: () => Promise<void>;
}

interface LockedOrderRow {
  id: string;
  order_number: number;
  client_id: string | null;
  status: string;
  is_paid: boolean;
  deleted_at: Date | null;
  cancelled_at: Date | null;
  source: string;
  price: Prisma.Decimal | null;
}

/**
 * Lock the order row for this transaction and re-check that it is the
 * dealer's and still editable. Throws {@link DealerOrderModifyError}.
 */
async function lockOwnModifiableOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
  actor: DealerActor,
): Promise<LockedOrderRow> {
  const rows = await tx.$queryRaw<LockedOrderRow[]>`
    SELECT id, order_number, client_id, status, is_paid, deleted_at, cancelled_at, source, price
    FROM orders
    WHERE id = ${orderId}
    FOR UPDATE
  `;
  const row = rows[0];
  if (!row || row.client_id !== actor.studioCustomerId) {
    throw new DealerOrderModifyError("not_found");
  }
  // Deleted by the staff (not a dealer cancel): gone from the cabinet.
  if (row.deleted_at && !row.cancelled_at) throw new DealerOrderModifyError("not_found");
  // Lines as they are under the lock: a line the workshop started locks the order.
  const orderLines = await tx.orderLine.findMany({
    where: { orderId },
    select: { productionStatus: true },
  });
  const block = dealerModifyBlockReason({
    orderLines,
    status: row.status,
    isPaid: row.is_paid,
    deletedAt: row.deleted_at,
    cancelledAt: row.cancelled_at,
    source: row.source,
  });
  if (block) throw new DealerOrderModifyError("order_locked", block);
  return row;
}

const ORDER_WITH_LINES_AND_FILES = {
  files: true,
  orderLines: { orderBy: { sortOrder: "asc" as const }, include: { files: true } },
} satisfies Prisma.OrderInclude;

/** Fast pre-check outside the transaction (no lock): same answers as the locked one. */
async function loadOwnModifiableOrder(
  db: Prisma.TransactionClient | typeof prisma,
  orderId: string,
  actor: DealerActor,
): Promise<OrderWithLinesAndFiles> {
  const order = await db.order.findFirst({
    where: { id: orderId, clientId: actor.studioCustomerId },
    include: ORDER_WITH_LINES_AND_FILES,
  });
  if (!order) throw new DealerOrderModifyError("not_found");
  if (order.deletedAt && !order.cancelledAt) throw new DealerOrderModifyError("not_found");
  const block = dealerModifyBlockReason(order);
  if (block) throw new DealerOrderModifyError("order_locked", block);
  return order;
}

/** Every stock the order still holds goes back (the same helpers, in the same order, as the admin delete). */
async function returnAllStockForOrder(
  tx: Prisma.TransactionClient,
  params: { orderId: string; orderNumber: number; createdById: string },
): Promise<void> {
  await returnMaterialStockForOrder(tx, params);
  await returnDtfStockForOrder(tx, params);
  await returnUvStockForOrder(tx, params);
  await returnSublimationStockForOrder(tx, params);
  await returnMugStockForOrder(tx, params);
  await returnPenStockForOrder(tx, params);
  await returnNotebookStockForOrder(tx, params);
  await returnPrinterConsumablesForOrder(tx, params);
}

export interface DealerEditResult {
  /** Dealer price of each line (null = the studio prices it). */
  lineTotalsMdl: (number | null)[];
  totalMdl: number | null;
}

/**
 * Re-price (dry run) or rewrite the dealer's order from the wizard's update
 * payload. Lines are resolved and priced exactly as on creation
 * (`POST /api/cabinet/orders`): dealer tier forced on every line, prices only
 * from the server, unpriced UV / sublimation print allowed. Stock of the old
 * lines goes back and the new lines take theirs (`syncAdminOrderStructureInTx`);
 * files the edit drops are copied to `OrderFileArchive` first.
 */
export async function dealerEditOrder(params: {
  orderId: string;
  actor: DealerActor;
  input: DealerOrderUpdateInput;
  hooks?: DealerModifyHooks;
}): Promise<DealerEditResult> {
  const { orderId, actor, input } = params;
  const preOrder = await loadOwnModifiableOrder(prisma, orderId, actor);

  const structure = { lines: expandToOneFilePerLine(input.lines) };
  const lineInputs: AdminOrderLineInput[] = buildAdminOrderUpdateLineInputs(preOrder, structure).map(
    (line) => ({ ...line, customerType: "dealer" as const, designId: undefined }),
  );

  if (!input.dryRun) {
    const tooLarge = await findArtworkLargerThanOrdered(lineInputs);
    if (tooLarge) throw new DealerOrderModifyError("artwork_larger_than_ordered", null, tooLarge);
  }

  const { resolved, lfLineTotalsMdl } = await resolveOrderLines(lineInputs, { allowUnpricedPrint: true });
  const lineTotalsMdl = await dealerLineTotalsMdl(resolved, lfLineTotalsMdl);
  const totalMdl = dealerOrderTotalMdl(lineTotalsMdl);
  if (input.dryRun) return { lineTotalsMdl, totalMdl };

  await prisma.$transaction(async (tx) => {
    await params.hooks?.beforeLock?.();
    const locked = await lockOwnModifiableOrder(tx, orderId, actor);
    await params.hooks?.afterLock?.();
    // Re-read under the lock: the sync works on the rows as they are now.
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: ORDER_WITH_LINES_AND_FILES,
    });
    const nextNotes = input.notes !== undefined ? input.notes?.trim() || null : order.notes;

    const { archivedFiles } = await syncAdminOrderStructureInTx(
      tx,
      order,
      structure,
      resolved,
      actor.userId,
      {
        phone: order.phone,
        clientName: order.clientName,
        clientId: order.clientId,
        notes: nextNotes,
        price: totalMdl,
      },
      { archiveRemovedFiles: { reason: "dealer_edit" } },
    );

    const editedAt = new Date();
    await tx.order.update({ where: { id: orderId }, data: { dealerEditedAt: editedAt } });
    await tx.orderLog.create({
      data: {
        orderId,
        userId: actor.userId,
        action: "dealer_edited",
        field: "price",
        oldValue: locked.price == null ? null : String(serializeOrderPrice(locked.price)),
        newValue: totalMdl == null ? null : String(totalMdl),
        metadata: {
          status: locked.status,
          lineCount: resolved.length,
          // Previous versions kept in `OrderFileArchive` (staff history links them).
          archivedFiles,
          notesChanged: nextNotes !== order.notes,
        },
      },
    });
  }, HEAVY_TX_OPTIONS);

  return { lineTotalsMdl, totalMdl };
}

/**
 * Cancel the dealer's order: soft delete (`deletedAt`, so it leaves debt,
 * boards, queues and reports everywhere at once) plus `cancelledAt` / reason /
 * who, so the cabinet keeps showing it as «Отменён» and the staff trash shows
 * why. All stock the order holds goes back. A second cancel finds the order
 * already cancelled (locked) and returns nothing twice.
 */
export async function dealerCancelOrder(params: {
  orderId: string;
  actor: DealerActor;
  reason: string;
  hooks?: DealerModifyHooks;
}): Promise<{ cancelledAt: Date }> {
  const { orderId, actor } = params;
  const reason = params.reason.trim();
  await loadOwnModifiableOrder(prisma, orderId, actor);

  return prisma.$transaction(async (tx) => {
    await params.hooks?.beforeLock?.();
    const locked = await lockOwnModifiableOrder(tx, orderId, actor);
    await params.hooks?.afterLock?.();
    const now = new Date();
    await tx.order.update({
      where: { id: orderId },
      data: {
        deletedAt: now,
        cancelledAt: now,
        cancelReason: reason,
        cancelledById: actor.userId,
      },
    });
    await returnAllStockForOrder(tx, {
      orderId,
      orderNumber: locked.order_number,
      createdById: actor.userId,
    });
    await tx.orderLog.create({
      data: {
        orderId,
        userId: actor.userId,
        action: "cancelled_by_dealer",
        field: "status",
        oldValue: locked.status,
        newValue: "CANCELLED",
        metadata: { reason },
      },
    });
    return { cancelledAt: now };
  }, HEAVY_TX_OPTIONS);
}
