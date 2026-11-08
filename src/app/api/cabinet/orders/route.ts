import { NextRequest, NextResponse } from "next/server";
import { isDealerOrderFileUrl, orderFileUrlIssues } from "@/lib/library/libraryKeys";
import { nanoid } from "nanoid";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { getCustomerSessionUser } from "@/lib/auth";
import {
  serializeOrderPrice,
  serializeOrderWithPrice,
  toOrderPriceDecimal,
} from "@/lib/orderPriceDecimal";
import { normalizeOrderPageLimit } from "@/lib/orderPagination";
import {
  CABINET_NEEDS_LAYOUT_FILTER,
  CABINET_ORDER_SORTS,
  CLIENT_VISIBLE_STATUSES,
  cabinetStatusFilterMembers,
  type CabinetOrderSort,
} from "@/lib/cabinetOrdersList";
import { getUnreadClientMessageCountMap } from "@/lib/clientMessagesUnread";
import { UNPAID_SHOP_ORDER_WHERE } from "@/lib/shop/orderFlags";
import { CABINET_VISIBLE_ORDER_WHERE } from "@/lib/cabinetOrderScope";
import { toCabinetOrderLineView, toPublicProductSnapshot } from "@/lib/cabinetOrderLineView";
import { fillDtfGarmentNames } from "@/lib/dtf/dtfGarmentNames";
import { toLayoutIssueView } from "@/lib/layoutIssue";
import { orderContactFromStudioCustomer } from "@/lib/studioClient";
import {
  dealerWizardOrderSchema,
  getCabinetVisibleStatus,
  type AdminOrderLineInput,
  type ClientVisibleStatus,
} from "@/lib/validations";
import {
  AdminOrderResolveError,
  buildOrderDenormalizedScalars,
  computeOrderProductTypeForAdmin,
  expandToOneFilePerLine,
  OrderLineLimitError,
} from "@/lib/adminOrderCreateHelpers";
import { findArtworkLargerThanOrdered } from "@/lib/files/serverArtworkCheck";
import { createOrderWithResolvedLines, resolveOrderLines } from "@/lib/orderCreate/orderLines";
import { cabinetLinesDoneSummary } from "@/lib/ownerLineFileReplace";
import { dealerFreeLines, dealerLineTotalsMdl, dealerOrderTotalMdl } from "@/lib/orderCreate/dealerLinePrices";
import { loadDealerUrgencyOffer } from "@/lib/dealerUrgencyServer";
import {
  chargedUrgencyFeeMdl,
  dealerUrgencyOnColumns,
  priceWithUrgencyFee,
  toFeeMdl,
  URGENCY_LOG_ACTIONS,
} from "@/lib/dealerUrgency";

/**
 * Customer-facing orders list. Always scoped to the logged-in customer's
 * StudioCustomer (`clientId`). We never look at the order's stored phone
 * number for ownership — that field is mutable by the studio. The
 * `studioCustomerId` link is set at creation time by the cabinet flow.
 *
 * Server-side search / filter / sort / pagination like the staff list
 * (`/api/orders`), with the same page sizes. Query params:
 * - `page`, `limit` (15 | 30 | 50 | 100)
 * - `search`: order number (digits, optional `#`) or file name
 * - `status`: client-visible status (see `getClientVisibleStatus`) or `pickup`
 *   (both «ready» states); the pre-split `inProgress` / `ready` still work
 * - `dateFrom`, `dateTo`: `YYYY-MM-DD`, inclusive
 * - `sort`: `date` | `number` | `amount` | `status`, `dir`: `asc` | `desc`
 *
 * `summary` (amount due, unpaid count, statuses present) always covers all
 * of the customer's orders, not just the filtered page.
 */
export async function GET(request: NextRequest) {
  const user = await getCustomerSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const clientId = user.studioCustomerId!;

  const sp = request.nextUrl.searchParams;
  const limit = normalizeOrderPageLimit(sp.get("limit") ?? undefined);
  const requestedPage = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const search = (sp.get("search") ?? "").trim().slice(0, 200);
  const statusParam = sp.get("status") ?? "";
  const statusMembers = cabinetStatusFilterMembers(statusParam);
  const dateFrom = parseDay(sp.get("dateFrom"));
  const dateTo = parseDay(sp.get("dateTo"));
  const sortParam = sp.get("sort");
  const sort: CabinetOrderSort = (CABINET_ORDER_SORTS as readonly string[]).includes(sortParam ?? "")
    ? (sortParam as CabinetOrderSort)
    : "date";
  const dir: "asc" | "desc" = sp.get("dir") === "asc" ? "asc" : "desc";

  // A customer has tens to a few hundred orders: read the light columns of all
  // of them once (needed for the summary anyway), filter + sort here, then
  // load the full rows for the requested page only.
  // Unpaid storefront orders stay out of the cabinet (list and «De plată»)
  // until their online payment goes through.
  // Dealer-cancelled orders stay listed (greyed «Отменён») but never count as due.
  const all = await prisma.order.findMany({
    where: { clientId, ...CABINET_VISIBLE_ORDER_WHERE, NOT: UNPAID_SHOP_ORDER_WHERE },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      price: true,
      isPaid: true,
      createdAt: true,
      cancelledAt: true,
      // «Нужен макет»: these orders wait for the customer, so they sort first.
      orderLines: { where: { productionStatus: "NEEDS_LAYOUT" }, select: { id: true } },
    },
  });
  const needsLayout = (o: { cancelledAt: Date | null; orderLines: { id: string }[] }) =>
    !o.cancelledAt && o.orderLines.length > 0;

  let totalDue = 0;
  let unpaidCount = 0;
  const statusesSeen = new Set<ClientVisibleStatus>();
  for (const o of all) {
    statusesSeen.add(getCabinetVisibleStatus(o));
    if (o.cancelledAt) continue;
    const price = serializeOrderPrice(o.price);
    if (!o.isPaid && price != null) {
      totalDue += price;
      unpaidCount += 1;
    }
  }

  // Search: number match (partial, like before) or a file name on the order.
  let fileMatchIds: Set<string> | null = null;
  const numberQuery = search.replace(/^#/, "").replace(/^0+(?=\d)/, "");
  const isNumberQuery = /^\d+$/.test(numberQuery);
  if (search) {
    const fileMatches = await prisma.file.findMany({
      where: {
        fileName: { contains: search, mode: "insensitive" },
        order: { clientId, ...CABINET_VISIBLE_ORDER_WHERE, NOT: UNPAID_SHOP_ORDER_WHERE },
      },
      select: { orderId: true },
    });
    fileMatchIds = new Set(fileMatches.map((f) => f.orderId));
  }

  const fromMs = dateFrom ? dateFrom.getTime() : null;
  const toMs = dateTo ? dateTo.getTime() + 86_400_000 : null;
  const filtered = all.filter((o) => {
    if (statusParam === CABINET_NEEDS_LAYOUT_FILTER) {
      if (!needsLayout(o)) return false;
    } else if (statusMembers && !statusMembers.includes(getCabinetVisibleStatus(o))) return false;
    const created = o.createdAt.getTime();
    if (fromMs !== null && created < fromMs) return false;
    if (toMs !== null && created >= toMs) return false;
    if (search) {
      const numberHit = isNumberQuery && String(o.orderNumber).includes(numberQuery);
      if (!numberHit && !fileMatchIds!.has(o.id)) return false;
    }
    return true;
  });

  const sign = dir === "asc" ? 1 : -1;
  const statusRank = (o: { status: string; cancelledAt: Date | null }) =>
    (CLIENT_VISIBLE_STATUSES as readonly string[]).indexOf(getCabinetVisibleStatus(o));
  filtered.sort((a, b) => {
    // Orders waiting for the customer's new layout always come first.
    const na = needsLayout(a) ? 0 : 1;
    const nb = needsLayout(b) ? 0 : 1;
    if (na !== nb) return na - nb;
    let cmp = 0;
    if (sort === "number") cmp = a.orderNumber - b.orderNumber;
    else if (sort === "amount") {
      const pa = serializeOrderPrice(a.price);
      const pb = serializeOrderPrice(b.price);
      // Orders without a price yet always go last.
      if (pa == null || pb == null) {
        if (pa == null && pb == null) cmp = 0;
        else return pa == null ? 1 : -1;
      } else cmp = pa - pb;
    } else if (sort === "status") cmp = statusRank(a) - statusRank(b);
    else cmp = a.createdAt.getTime() - b.createdAt.getTime();
    if (cmp !== 0) return cmp * sign;
    // Stable tie-break: newest first.
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  const totalCount = filtered.length;
  const totalPages = totalCount > 0 ? Math.ceil(totalCount / limit) : 0;
  const page = totalPages > 0 ? Math.min(requestedPage, totalPages) : 1;
  const pageIds = filtered.slice((page - 1) * limit, page * limit).map((o) => o.id);

  const rows = pageIds.length
    ? await prisma.order.findMany({
        where: { id: { in: pageIds }, clientId, ...CABINET_VISIBLE_ORDER_WHERE, NOT: UNPAID_SHOP_ORDER_WHERE },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          cancelledAt: true,
          productType: true,
          price: true,
          isPaid: true,
          createdAt: true,
          isPrio: true,
          urgencyFee: true,
          urgencyByDealerAt: true,
          mugProductSnapshot: true,
          notebookProductSnapshot: true,
          penProductSnapshot: true,
          files: {
            select: {
              id: true,
              fileName: true,
              fileUrl: true,
              paperType: true,
              pageCount: true,
              copies: true,
              color: true,
              orderLineId: true,
            },
          },
          // Positions: what each one is (item, colour, sizes, print zones,
          // material…). The raw JSON carries costs and prices, so it is
          // reduced to `toCabinetOrderLineView` before it leaves the server.
          orderLines: {
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              productType: true,
              mugProductSnapshot: true,
              notebookProductSnapshot: true,
              penProductSnapshot: true,
              largeFormatLineData: true,
              businessCardLineData: true,
              dtfLineData: true,
              uvLineData: true,
              setData: true,
              sublimationLineData: true,
              productionStatus: true,
              layoutIssueReason: true,
              layoutIssueNote: true,
              layoutIssueAt: true,
            },
          },
        },
      })
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const orders = pageIds.map((id) => byId.get(id)).filter((o) => o != null);

  await fillDtfGarmentNames(orders.flatMap((o) => o.orderLines));
  const unreadMap = await getUnreadClientMessageCountMap(
    orders.map((o) => o.id),
    user.id,
    "customer",
  );

  return NextResponse.json({
    orders: orders.map(({ urgencyFee, urgencyByDealerAt, ...o }) => ({
      ...serializeOrderWithPrice({
        ...o,
        // Legacy single-product orders keep the snapshot on the order itself.
        mugProductSnapshot: toPublicProductSnapshot(o.mugProductSnapshot),
        notebookProductSnapshot: toPublicProductSnapshot(o.notebookProductSnapshot),
        penProductSnapshot: toPublicProductSnapshot(o.penProductSnapshot),
        orderLines: o.orderLines.map((line) => ({
          ...toCabinetOrderLineView(line),
          layoutIssue: o.cancelledAt ? null : toLayoutIssueView(line),
        })),
      }),
      unreadMessageCount: unreadMap.get(o.id) ?? 0,
      /** Dealer «Срочно» fee inside `price` (null = not requested by the dealer). */
      urgencyFeeMdl: chargedUrgencyFeeMdl({ urgencyByDealerAt, urgencyFee }) || null,
      /** Lines waiting for the customer's new file (red row «Нужен новый макет»). */
      needsLayoutCount: o.cancelledAt ? 0 : o.orderLines.filter((l) => l.productionStatus === "NEEDS_LAYOUT").length,
      /** «Готово N из M» next to the status while the positions are mixed; null otherwise. */
      linesDone: o.cancelledAt ? null : cabinetLinesDoneSummary(o.orderLines),
    })),
    page,
    totalPages,
    totalCount,
    summary: {
      allCount: all.length,
      totalDue: Math.round(totalDue * 100) / 100,
      unpaidCount,
      statuses: CLIENT_VISIBLE_STATUSES.filter((s) => statusesSeen.has(s)),
      /** Orders waiting for the customer's new layout (all of them, not just this page). */
      needsLayoutCount: all.filter(needsLayout).length,
    },
  });
}

function parseDay(raw: string | null): Date | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Order from the dealer cabinet's order wizard (same positions as the staff
 * wizard: DTF, UV, sublimation, stock items, large format, sheets, …).
 *
 * The contact is the logged-in dealer, every line is priced on the server at
 * the dealer tier, and the order goes straight to the workshop like other
 * dealer cabinet orders. `dryRun: true` only prices the lines (the confirm
 * step shows that total before the files are uploaded).
 */
export async function POST(request: NextRequest) {
  const user = await getCustomerSessionUser();
  if (!user || !user.studioCustomer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.studioCustomer.isDealer !== true) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const validated = dealerWizardOrderSchema.parse(await request.json());
    // Own uploads and links only: library / storefront keys are not the dealer's.
    if (orderFileUrlIssues(validated.lines, (u) => isDealerOrderFileUrl(u, { dryRun: validated.dryRun })).length > 0) {
      return NextResponse.json({ error: "Invalid file key", code: "invalid_file_url" }, { status: 400 });
    }

    const contact = orderContactFromStudioCustomer(user.studioCustomer);
    if (!contact.phone || contact.phone.length < 8) {
      return NextResponse.json(
        { error: "Your portal account has no valid phone. Please contact the studio." },
        { status: 400 },
      );
    }

    const lineInputs: AdminOrderLineInput[] = expandToOneFilePerLine(
      validated.lines.map((line) => ({ ...line, customerType: "dealer" as const })),
    );

    if (!validated.dryRun) {
      // Price follows the declared size: refuse artwork that prints bigger than that.
      const tooLarge = await findArtworkLargerThanOrdered(lineInputs);
      if (tooLarge) {
        return NextResponse.json(
          { error: `Artwork ${tooLarge} is larger than the ordered size`, code: "artwork_larger_than_ordered" },
          { status: 422 },
        );
      }
    }

    // A print without a rate goes in unpriced: the studio prices it (order total null).
    const { resolved, lfLineTotalsMdl } = await resolveOrderLines(lineInputs, { allowUnpricedPrint: true });
    const lineTotals = await dealerLineTotalsMdl(resolved, lfLineTotalsMdl);
    const goodsTotal = dealerOrderTotalMdl(lineTotals, dealerFreeLines(resolved));

    // «Срочно»: offer and fee come from the dealer's card / the global setting only.
    const urgencyOffer = await loadDealerUrgencyOffer(prisma, user.studioCustomer.id);
    const urgent = validated.urgent === true;
    if (urgent && !urgencyOffer.available) {
      return NextResponse.json(
        { error: "Urgency is not available for this account", code: "urgency_unavailable" },
        { status: 400 },
      );
    }
    const urgencyFee = urgent && urgencyOffer.available ? urgencyOffer.feeMdl : null;
    const total = priceWithUrgencyFee(goodsTotal, urgencyFee);

    if (validated.dryRun) {
      return NextResponse.json({
        lineTotalsMdl: lineTotals,
        totalMdl: total,
        goodsTotalMdl: goodsTotal,
        urgency: { ...urgencyOffer, state: urgent ? "dealer" : "off" },
      });
    }

    const orderProductType = computeOrderProductTypeForAdmin(resolved);
    const denorm = buildOrderDenormalizedScalars(orderProductType, resolved);

    const order = await createOrderWithResolvedLines({
      order: {
        phone: contact.phone,
        ...(contact.clientName ? { clientName: contact.clientName } : {}),
        clientId: user.studioCustomerId ?? undefined,
        notes: validated.notes?.trim() || undefined,
        ...(total != null ? { price: toOrderPriceDecimal(total) ?? undefined } : {}),
        ...denorm,
        status: "SENT_TO_WORKSHOP",
        isWorkshop: true,
        createdBy: user.id,
        sentToWorkshopBy: user.id,
        publicToken: nanoid(21),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        ...(urgencyFee !== null ? dealerUrgencyOnColumns(urgencyFee, user.id, new Date()) : {}),
      },
      resolved,
      actorId: user.id,
      afterCreate:
        urgencyFee !== null
          ? async (tx, created) => {
              await tx.orderLog.create({
                data: {
                  orderId: created.id,
                  userId: user.id,
                  action: URGENCY_LOG_ACTIONS.dealerOn,
                  field: "isPrio",
                  oldValue: "false",
                  newValue: "true",
                  metadata: { feeMdl: urgencyFee, goodsTotalMdl: goodsTotal },
                },
              });
            }
          : undefined,
    });

    // Only what the dealer wizard needs to open the new order: the created row
    // carries raw line JSON with costs, so it is never echoed back.
    return NextResponse.json(
      {
        id: order.id,
        orderNumber: order.orderNumber,
        price: serializeOrderPrice(order.price),
        urgencyFeeMdl: toFeeMdl(order.urgencyFee),
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof OrderLineLimitError) {
      return NextResponse.json({ error: "Too many positions", code: error.code }, { status: 400 });
    }
    if (error instanceof AdminOrderResolveError) {
      return NextResponse.json({ error: error.message, code: error.message }, { status: 400 });
    }
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Validation failed", details: error.issues }, { status: 400 });
    }
    console.error("Failed to create dealer wizard order:", error);
    return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
  }
}
