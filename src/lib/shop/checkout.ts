import "server-only";
import type { Prisma } from "@prisma/client";
import { nanoid } from "nanoid";
import {
  AdminOrderResolveError,
  buildOrderDenormalizedScalars,
  computeOrderProductTypeForAdmin,
} from "@/lib/adminOrderCreateHelpers";
import { findClientIdByOrderPhone } from "@/lib/findClientByOrderPhone";
import { round2 } from "@/lib/money";
import { createOrderWithResolvedLines, resolveOrderLines } from "@/lib/orderCreate/orderLines";
import { toOrderPriceDecimal } from "@/lib/orderPriceDecimal";
import { prisma } from "@/lib/prisma";
import { publicDtfEngineInput, quotePublicLines, type PublicQuoteLineResult } from "@/lib/publicQuote/publicQuote";
import { parsePublicQuoteLine, type PublicQuoteLineInput } from "@/lib/publicQuote/publicQuoteSchema";
import { uvLineInputSchema } from "@/lib/uv/uvLineInput";
import type { AdminOrderLineInput, FileInput } from "@/lib/validations";
import type { ShopDeliveryMethod } from "./constants";
import {
  checkoutFieldErrors,
  shopCheckoutRequestSchema,
  type ShopCheckoutLine,
  type ShopCheckoutRequest,
} from "./checkoutSchema";
import { shopDeliveryPriceMdl } from "./delivery";
import { SHOP_TEST_ORDER_NOTE_PREFIX } from "./orderFlags";
import { PaymentNotConfiguredError, resolvePaymentProvider, type StartPaymentResult } from "./payment";
import { copyUploadToShopOrders } from "./shopFiles";

/**
 * Storefront checkout: validate the cart, re-price every line on the server
 * (`quotePublicLines`, retail — client prices are never read), create one
 * `Order` (source 'shop', status NEW, payment pending) with one `OrderLine`
 * per cart line through the admin order pipeline (same snapshots, stock
 * deduction and procurement flags as a staff-entered order), then start the
 * payment.
 *
 * No way to pay (no real provider and the caller may not use the fake one —
 * production without a tester pass) → 503 `payment_unavailable` before any
 * write: no order, no file copies, no stock.
 *
 * While the fake `test` payment provider is used (`isTestPaymentAllowed`
 * — Vercel previews run on the production database) the order is a TEST
 * order: `paymentProvider='test'`, notes start with «[ТЕСТ сайт]», no stock is
 * deducted, no procurement flag is set and it is not linked to a registry
 * client (so it never shows in a real client's cabinet or debt).
 */

type Env = Readonly<Record<string, string | undefined>>;

export interface ShopCheckoutResponse {
  status: number;
  body: Record<string, unknown>;
}

/** What a storefront cart line looked like to the customer (`OrderLine.shopLineData`). */
export interface ShopLineData {
  kind: PublicQuoteLineInput["kind"];
  title: string;
  optionsText?: string;
  note?: string;
  quantity: number;
  unitPrice: number;
  total: number;
  /** The validated quote input the line was priced from. */
  quote: PublicQuoteLineInput;
}

type LineOk = Extract<PublicQuoteLineResult, { ok: true }>;

/** Line kinds whose piece count lives in the files' copies (mug / notebook / pen). */
const QTY_IN_FILES: ReadonlySet<string> = new Set(["mug", "notebook", "pen"]);

const DELIVERY_LABEL_RU: Record<ShopDeliveryMethod, string> = {
  pickup: "Самовывоз",
  courier_chisinau: "Курьер по Кишинёву",
  courier_moldova: "Курьер по Молдове",
};

/**
 * Order files of one line. For mug / notebook / pen the order pipeline reads
 * the piece count from the files' copies, so the first file carries the run
 * (the others one copy each).
 */
export function shopLineFiles(
  kind: PublicQuoteLineInput["kind"],
  files: readonly { fileKey: string; fileName: string }[],
  quantity: number,
): FileInput[] {
  return files.map((f, i) => ({
    fileName: f.fileName,
    fileUrl: f.fileKey,
    copies: QTY_IN_FILES.has(kind) && i === 0 ? Math.max(1, quantity - (files.length - 1)) : 1,
    color: "color" as const,
  }));
}

/**
 * Admin order-line input for a priced storefront line (retail tier), or a
 * reason it cannot be ordered online. Mirrors how the public quote builds
 * each engine's input, so the order resolves to the quoted price.
 */
export function shopLineToAdminInput(
  line: PublicQuoteLineInput,
  priced: LineOk,
  files: FileInput[],
): AdminOrderLineInput | { error: "not_orderable" | "invalid" } {
  const base = { customerType: "retail" as const, files };
  switch (line.kind) {
    case "mug":
      return { ...base, productType: "mug", mugProductId: line.productId };
    case "notebook":
      return { ...base, productType: "notebook", notebookProductId: line.productId };
    case "pen":
      return { ...base, productType: "pen", penProductId: line.productId };
    case "dtf": {
      const dtf = publicDtfEngineInput(line);
      if ("error" in dtf) return { error: "invalid" };
      return { ...base, productType: "dtf_apparel", dtf };
    }
    case "uv": {
      const uv = uvLineInputSchema.safeParse({
        source: line.source,
        ...(line.technique ? { technique: line.technique } : {}),
        ...(line.variantId ? { variantId: line.variantId } : {}),
        quantity: line.quantity,
        zones: line.zones,
      });
      if (!uv.success) return { error: "invalid" };
      return { ...base, productType: "uv_print", uv: uv.data };
    }
    case "businessCard":
      return {
        ...base,
        productType: line.productType,
        sheetPaperId: line.sheetPaperId,
        cardSides: line.sides,
        cardPresetId: line.cardPresetId,
        cardTrimWidthCm: line.cardTrimWidthCm,
        cardTrimHeightCm: line.cardTrimHeightCm,
        // The quoted run (raised to whole sheets).
        quantity: priced.quantity,
      };
    case "stockItem":
      // A plain item without print has no order-line kind in the studio
      // pipeline yet (no snapshot / stock path) — not sold online in the pilot.
      return { error: "not_orderable" };
  }
}

/** Order notes for staff: delivery + one row per cart line (≤ 500 chars, the notes editor limit). */
export function buildShopStaffNotes(req: ShopCheckoutRequest, opts: { test?: boolean } = {}): string {
  const d = req.delivery;
  const delivery = [DELIVERY_LABEL_RU[d.method], d.city, d.address].filter(Boolean).join(", ");
  const head = `Сайт · ${delivery}${d.note ? ` (${d.note})` : ""}`;
  const rows: string[] = [opts.test ? `${SHOP_TEST_ORDER_NOTE_PREFIX} ${head}` : head];
  req.lines.forEach((l, i) => {
    const parts = [l.title, l.optionsText, l.note ? `прим.: ${l.note}` : undefined].filter(Boolean);
    rows.push(`${i + 1}) ${parts.join(" — ")}`);
  });
  const text = rows.join("\n");
  return text.length > 500 ? `${text.slice(0, 499)}…` : text;
}

function invalid(fieldErrors: Record<string, string>): ShopCheckoutResponse {
  return { status: 400, body: { error: "invalid_input", fieldErrors } };
}

interface PreparedLine {
  input: PublicQuoteLineInput;
  priced: LineOk;
  source: ShopCheckoutLine;
}

/**
 * Validate and price a checkout body. Returns the error response, or the
 * priced lines with the totals. No writes.
 */
export async function priceShopCheckout(
  raw: unknown,
  env: Env = process.env,
): Promise<
  | { ok: false; response: ShopCheckoutResponse }
  | { ok: true; req: ShopCheckoutRequest; lines: PreparedLine[]; subtotal: number; deliveryPrice: number; total: number }
> {
  const parsed = shopCheckoutRequestSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, response: invalid(checkoutFieldErrors(parsed.error)) };
  const req = parsed.data;

  const quote = await quotePublicLines(
    req.lines.map((l) => l.quote),
    req.locale,
  );
  const lines: PreparedLine[] = [];
  for (let i = 0; i < req.lines.length; i++) {
    const q = quote.lines[i];
    const p = parsePublicQuoteLine(req.lines[i]!.quote);
    if (!q || !q.ok || !p.ok) {
      return {
        ok: false,
        response: {
          status: 422,
          body: {
            error: "line_unavailable",
            index: i,
            reason: q && !q.ok ? q.reason : "invalid",
            ...(q && !q.ok ? { code: q.code } : {}),
          },
        },
      };
    }
    if (p.line.kind === "stockItem") {
      return { ok: false, response: { status: 422, body: { error: "line_unavailable", index: i, reason: "not_orderable" } } };
    }
    if (QTY_IN_FILES.has(p.line.kind) && !(req.lines[i]!.files?.length)) {
      return { ok: false, response: invalid({ [`lines.${i}.files`]: "required" }) };
    }
    lines.push({ input: p.line, priced: q, source: req.lines[i]! });
  }

  const subtotal = round2(lines.reduce((s, l) => s + l.priced.total, 0));
  const deliveryPrice = shopDeliveryPriceMdl(req.delivery.method, env);
  return { ok: true, req, lines, subtotal, deliveryPrice, total: round2(subtotal + deliveryPrice) };
}

export interface ShopCheckoutOptions {
  /** Caller holds a tester pass or a staff session (may use the test payment in production). */
  tester?: boolean;
}

/** Full checkout: price, copy files, create the order, start the payment. */
export async function runShopCheckout(
  raw: unknown,
  env: Env = process.env,
  opts: ShopCheckoutOptions = {},
): Promise<ShopCheckoutResponse> {
  const provider = resolvePaymentProvider(env, { tester: opts.tester });
  if (!provider) return { status: 503, body: { error: "payment_unavailable" } };

  const priced = await priceShopCheckout(raw, env);
  if (!priced.ok) return priced.response;
  const { req, lines, subtotal, deliveryPrice, total } = priced;

  // Copy every upload out of the 7-day `uploads/` lifecycle.
  const lineInputs: AdminOrderLineInput[] = [];
  const shopLineData: Prisma.InputJsonValue[] = [];
  for (let i = 0; i < lines.length; i++) {
    const { input, priced: q, source } = lines[i]!;
    const copied: { fileKey: string; fileName: string }[] = [];
    for (const f of source.files ?? []) {
      const key = await copyUploadToShopOrders(f.fileKey);
      if (!key) return { status: 400, body: { error: "file_not_found", index: i, fileKey: f.fileKey } };
      copied.push({ fileKey: key, fileName: f.fileName });
    }
    const adminInput = shopLineToAdminInput(input, q, shopLineFiles(input.kind, copied, q.quantity));
    if ("error" in adminInput) {
      return { status: 422, body: { error: "line_unavailable", index: i, reason: adminInput.error } };
    }
    lineInputs.push(adminInput);
    const data: ShopLineData = {
      kind: input.kind,
      title: source.title,
      ...(source.optionsText ? { optionsText: source.optionsText } : {}),
      ...(source.note ? { note: source.note } : {}),
      quantity: q.quantity,
      unitPrice: q.unitPrice,
      total: q.total,
      quote: input,
    };
    shopLineData.push(data as unknown as Prisma.InputJsonValue);
  }

  let resolved;
  try {
    ({ resolved } = await resolveOrderLines(lineInputs));
  } catch (e) {
    if (e instanceof AdminOrderResolveError) {
      return { status: 422, body: { error: "line_unavailable", index: null, reason: "invalid", code: e.message } };
    }
    throw e;
  }

  const isTest = provider.name === "test";
  const clientId = isTest ? null : await findClientIdByOrderPhone(req.customer.phone);
  const denorm = buildOrderDenormalizedScalars(computeOrderProductTypeForAdmin(resolved), resolved);

  const order = await createOrderWithResolvedLines({
    order: {
      phone: req.customer.phone,
      clientName: req.customer.name,
      clientId: clientId ?? undefined,
      notes: buildShopStaffNotes(req, { test: isTest }),
      price: toOrderPriceDecimal(total) ?? undefined,
      ...denorm,
      status: "NEW",
      isWorkshop: false,
      publicToken: nanoid(21),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      source: "shop",
      paymentStatus: "pending",
      paymentProvider: provider.name,
      customerName: req.customer.name,
      customerEmail: req.customer.email ?? null,
      deliveryMethod: req.delivery.method,
      deliveryCity: req.delivery.city ?? null,
      deliveryAddress: req.delivery.address ?? null,
      deliveryNote: req.delivery.note ?? null,
      deliveryPriceMdl: toOrderPriceDecimal(deliveryPrice),
    },
    resolved,
    actorId: null,
    shopLineData,
    skipStock: isTest,
  });

  const summary = {
    orderId: order.id,
    orderNumber: order.orderNumber,
    publicToken: order.publicToken,
    total,
    deliveryPrice,
    subtotal,
  };

  let started: StartPaymentResult;
  try {
    started = await provider.startPayment({
      orderId: order.id,
      orderNumber: order.orderNumber,
      publicToken: order.publicToken,
      amountMdl: total,
      customer: { name: req.customer.name, phone: req.customer.phone, email: req.customer.email },
      locale: req.locale,
      description: `ANVI #${order.orderNumber}`,
    });
  } catch (e) {
    if (e instanceof PaymentNotConfiguredError) {
      return { status: 503, body: { error: "payment_not_configured", ...summary } };
    }
    throw e;
  }
  if (started.paymentRef) {
    await prisma.order.update({ where: { id: order.id }, data: { paymentRef: started.paymentRef } });
  }

  return {
    status: 201,
    body: { ...summary, payment: { provider: started.provider, redirectUrl: started.redirectUrl } },
  };
}
