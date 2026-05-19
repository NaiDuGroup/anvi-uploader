import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Batch lookup of invoice-line-item links for a set of order IDs.
 *
 * Used by the admin orders list to render the "Cont N" badge next to
 * each row WITHOUT pulling `invoiceLineItems → invoice` into the heavy
 * `/api/orders` payload. The list now resolves badges lazily after the
 * primary listing has already been delivered to the client.
 *
 * Query params:
 * - `ids`: comma-separated order IDs (max 100, validated below).
 *
 * Response shape: `{ [orderId]: Array<{ id, invoice: { id, number } }> }`.
 * Orders that have no linked invoices are omitted from the map entirely
 * to keep the JSON payload minimal.
 */
const MAX_IDS = 100;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const idsParam = request.nextUrl.searchParams.get("ids")?.trim() ?? "";
  if (!idsParam) {
    return NextResponse.json({});
  }

  const ids = idsParam
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is string => s.length > 0 && UUID_RE.test(s))
    .slice(0, MAX_IDS);

  if (ids.length === 0) {
    return NextResponse.json({});
  }

  const items = await prisma.invoiceLineItem.findMany({
    where: { orderId: { in: ids }, invoice: { number: { not: null } } },
    select: {
      id: true,
      orderId: true,
      invoice: {
        select: {
          id: true,
          number: true,
        },
      },
    },
  });

  const map: Record<string, Array<{ id: string; invoice: { id: string; number: string | null } }>> =
    {};
  for (const li of items) {
    if (!li.orderId) continue;
    const list = map[li.orderId] ?? (map[li.orderId] = []);
    list.push({ id: li.id, invoice: li.invoice });
  }

  return NextResponse.json(map);
}
