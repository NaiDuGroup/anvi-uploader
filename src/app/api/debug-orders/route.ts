import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const steps: Record<string, unknown> = {};

  try {
    steps.step1_select1 = "running";
    await prisma.$queryRaw`SELECT 1`;
    steps.step1_select1 = "ok";
  } catch (e) {
    steps.step1_select1 = e instanceof Error ? e.message : String(e);
    return NextResponse.json(steps, { status: 500 });
  }

  try {
    steps.step2_count = "running";
    const count = await prisma.order.count({ where: { deletedAt: null } });
    steps.step2_count = count;
  } catch (e) {
    steps.step2_count = e instanceof Error ? e.message : String(e);
    return NextResponse.json(steps, { status: 500 });
  }

  try {
    steps.step3_findFirst = "running";
    const order = await prisma.order.findFirst({
      where: { deletedAt: null, price: { not: null } },
      select: {
        id: true,
        orderNumber: true,
        price: true,
        status: true,
        invoiceLineItems: {
          where: { invoice: { number: { not: null } } },
          select: {
            id: true,
            invoice: { select: { id: true, number: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    steps.step3_findFirst = order
      ? {
          id: order.id,
          orderNumber: order.orderNumber,
          priceType: order.price === null ? "null" : typeof order.price,
          priceConstructor: order.price === null ? "null" : order.price.constructor?.name,
          priceValue: order.price === null ? null : String(order.price),
          invoiceLineItemsCount: order.invoiceLineItems.length,
        }
      : "no_orders_with_price";
  } catch (e) {
    steps.step3_findFirst = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    return NextResponse.json(steps, { status: 500 });
  }

  try {
    steps.step4_rawCte = "running";
    const rows = await prisma.$queryRaw<Array<{ id: string | null; total_count: bigint }>>`
      WITH filtered_orders AS (
        SELECT id, is_prio, status, created_at
        FROM orders
        WHERE deleted_at IS NULL
      ),
      total AS (
        SELECT COUNT(*)::bigint AS total_count FROM filtered_orders
      ),
      page_ids AS (
        SELECT fo.id
        FROM filtered_orders fo
        ORDER BY fo.is_prio DESC, fo.created_at DESC
        LIMIT 5
      )
      SELECT page_ids.id, total.total_count
      FROM total
      LEFT JOIN page_ids ON true
    `;
    steps.step4_rawCte = {
      rowCount: rows.length,
      totalCount: rows.length > 0 ? String(rows[0]!.total_count) : "0",
      ids: rows.map((r) => r.id).filter(Boolean).slice(0, 3),
    };
  } catch (e) {
    steps.step4_rawCte = e instanceof Error ? e.message : String(e);
    return NextResponse.json(steps, { status: 500 });
  }

  try {
    steps.step5_findManyWithRelations = "running";
    const ids = (steps.step4_rawCte as { ids: string[] }).ids;
    if (ids.length > 0) {
      const orders = await prisma.order.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          price: true,
          files: { select: { id: true } },
          orderLines: { select: { id: true } },
          invoiceLineItems: {
            where: { invoice: { number: { not: null } } },
            select: {
              id: true,
              invoice: { select: { id: true, number: true } },
            },
          },
        },
      });
      steps.step5_findManyWithRelations = {
        count: orders.length,
        sample: orders[0]
          ? {
              id: orders[0].id,
              priceType: orders[0].price === null ? "null" : typeof orders[0].price,
              filesCount: orders[0].files.length,
              linesCount: orders[0].orderLines.length,
              invoiceLinesCount: orders[0].invoiceLineItems.length,
            }
          : null,
      };
    } else {
      steps.step5_findManyWithRelations = "skipped_no_ids";
    }
  } catch (e) {
    steps.step5_findManyWithRelations = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    return NextResponse.json(steps, { status: 500 });
  }

  try {
    steps.step6_fullSelect30 = "running";
    const ids30 = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM orders
      WHERE deleted_at IS NULL
      ORDER BY is_prio DESC, created_at DESC
      LIMIT 30
    `;
    const idList = ids30.map((r) => r.id);
    const orders30 = await prisma.order.findMany({
      where: { id: { in: idList } },
      select: {
        id: true,
        orderNumber: true,
        phone: true,
        status: true,
        assignedTo: true,
        isWorkshop: true,
        isPrio: true,
        price: true,
        isPaid: true,
        notes: true,
        issueReason: true,
        createdBy: true,
        sentToWorkshopBy: true,
        clientName: true,
        clientId: true,
        productType: true,
        mugProductId: true,
        mugProductSnapshot: true,
        notebookProductId: true,
        notebookProductSnapshot: true,
        approvalFeedback: true,
        publicToken: true,
        expiresAt: true,
        createdAt: true,
        deletedAt: true,
        needsProcurement: true,
        procurementMeta: true,
        invoiceLineItems: {
          where: { invoice: { number: { not: null } } },
          select: {
            id: true,
            invoice: { select: { id: true, number: true } },
          },
        },
        files: {
          select: {
            id: true,
            orderId: true,
            orderLineId: true,
            fileUrl: true,
            fileName: true,
            copies: true,
            color: true,
            paperType: true,
            pageCount: true,
          },
        },
        orderLines: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            orderId: true,
            sortOrder: true,
            productType: true,
            mugProductId: true,
            mugProductSnapshot: true,
            notebookProductId: true,
            notebookProductSnapshot: true,
            largeFormatMaterialId: true,
          },
        },
      },
    });
    const withPrice = orders30.filter((o) => o.price !== null);
    steps.step6_fullSelect30 = {
      fetched: orders30.length,
      withPrice: withPrice.length,
      samplePrice: withPrice[0]
        ? {
            id: withPrice[0].id,
            priceType: typeof withPrice[0].price,
            priceConstructor: withPrice[0].price?.constructor?.name,
            priceStr: String(withPrice[0].price),
          }
        : null,
    };
  } catch (e) {
    steps.step6_fullSelect30 = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    return NextResponse.json(steps, { status: 500 });
  }

  return NextResponse.json({ status: "all_ok", steps });
}
