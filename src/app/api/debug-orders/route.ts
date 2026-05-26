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
      where: { deletedAt: null },
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
          priceValue: order.price === null ? null : String(order.price),
          invoiceLineItemsCount: order.invoiceLineItems.length,
        }
      : "no_orders";
  } catch (e) {
    steps.step3_findFirst = e instanceof Error ? e.message : String(e);
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
    steps.step5_findManyWithRelations = e instanceof Error ? e.message : String(e);
    return NextResponse.json(steps, { status: 500 });
  }

  return NextResponse.json({ status: "all_ok", steps });
}
