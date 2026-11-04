import "server-only";
import type { Prisma } from "@prisma/client";
import { nanoid } from "nanoid";
import {
  AdminOrderResolveError,
  buildOrderDenormalizedScalars,
  computeOrderProductTypeForAdmin,
  type ResolvedAdminOrderLine,
} from "@/lib/adminOrderCreateHelpers";
import { findClientIdByOrderPhone } from "@/lib/findClientByOrderPhone";
import { dtfZoneFilePaperType } from "@/lib/dtf/dtfConstants";
import { BUSINESS_CARD_BACK_PAPER_TYPE, BUSINESS_CARD_FRONT_PAPER_TYPE } from "@/lib/businessCard/businessCardConstants";
import { round2 } from "@/lib/money";
import { createOrderWithResolvedLines, resolveOrderLines } from "@/lib/orderCreate/orderLines";
import { toOrderPriceDecimal } from "@/lib/orderPriceDecimal";
import { prisma } from "@/lib/prisma";
import { publicDtfEngineInput, quotePublicLines, type PublicQuoteLineResult } from "@/lib/publicQuote/publicQuote";
import { parsePublicQuoteLine, type PublicQuoteLineInput } from "@/lib/publicQuote/publicQuoteSchema";
import { SHOP_BC_PRESET_ID, shopBcRequiredZones } from "@/lib/storefront/businessCards";
import { kindNeedsFile } from "@/lib/storefront/fileRules";
import { shopT } from "@/lib/storefront/i18n";
import { describeQuoteLine, type ShopLineLabels } from "@/lib/storefront/lineLabels";
import { loadShopLineLabels } from "@/lib/storefront/lineLabelsServer";
import type { ShopQuoteLine } from "@/lib/storefront/types";
import { uvLineInputSchema } from "@/lib/uv/uvLineInput";
import type { AdminOrderLineInput, FileInput } from "@/lib/validations";
import { SHOP_ORDER_FILE_PREFIX, type ShopDeliveryMethod } from "./constants";
import {
  checkoutFieldErrors,
  shopCheckoutRequestSchema,
  type ShopCheckoutLine,
  type ShopCheckoutRequest,
} from "./checkoutSchema";
import { resolveShopBusinessCardLine } from "./businessCardShop";
import { shopDeliveryPriceMdl } from "./delivery";
import { SHOP_TEST_ORDER_NOTE_PREFIX } from "./orderFlags";
import { PaymentNotConfiguredError, resolvePaymentProvider, type StartPaymentResult } from "./payment";
import { findOrCreateShopCustomer } from "./account/customers";
import { ownsReusableShopFile } from "./account/data";
import { copyUploadToShopOrders } from "./shopFiles";
import { shopStockCheckEnabled } from "./stockSwitch";
import { dtfGarmentStockItemId, shopDtfItemLimitError, type ShopDtfItemRow } from "./dtfItemLimits";
import {
  dtfStockItemIds,
  findStockShortage,
  shopStockDemands,
  type StockShortage,
} from "./stockCheck";

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
 *
 * With `SHOP_STOCK_CHECK=1` every line must fit in stock (`checkShopStock`,
 * test orders too; off by default — balances not trusted yet): otherwise
 * 422 `line_unavailable` with `reason: "out_of_stock"` and the pieces left.
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
 * (the others one copy each). DTF files carry their print zone
 * (`paperType = dtf:<zoneId>`, as the studio wizard saves them) so the admin
 * and the workshop show which transfer each file is; an unknown zone falls
 * back to the first one. Business-card files carry their face
 * (`business_card_front` / `business_card_back`, as the studio wizard saves
 * them) so the imposition puts the front on page 1.
 */
export function shopLineFiles(
  kind: PublicQuoteLineInput["kind"],
  files: readonly { fileKey: string; fileName: string; zone?: string }[],
  quantity: number,
  dtfZoneIds: readonly string[] = [],
): FileInput[] {
  return files.map((f, i) => {
    const zone: string | undefined =
      kind === "dtf" ? (f.zone && dtfZoneIds.includes(f.zone) ? f.zone : dtfZoneIds[0]) : undefined;
    const paperType: string | undefined =
      kind === "businessCard"
        ? f.zone === "back"
          ? BUSINESS_CARD_BACK_PAPER_TYPE
          : BUSINESS_CARD_FRONT_PAPER_TYPE
        : zone
          ? dtfZoneFilePaperType(zone)
          : undefined;
    return {
      fileName: f.fileName,
      fileUrl: f.fileKey,
      copies: QTY_IN_FILES.has(kind) && i === 0 ? Math.max(1, quantity - (files.length - 1)) : 1,
      color: "color" as const,
      ...(paperType ? { paperType } : {}),
    };
  });
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
      if (line.pricing === "shopPack") {
        // The paper is the shop default, filled in when the pack is resolved (`resolveShopBusinessCardLine`).
        return {
          ...base,
          productType: "business_card",
          cardSides: line.sides,
          cardPresetId: SHOP_BC_PRESET_ID,
          quantity: priced.quantity,
        };
      }
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

/** Per cart line, for the staff note: the priced pieces and the options in Russian (null = keep the customer's text). */
export interface ShopStaffNoteLine {
  quantity: number;
  optionsRu?: string | null;
}

/**
 * Order notes for staff, in Russian (the studio language): delivery + one row
 * per cart line with its pieces (≤ 500 chars, the notes editor limit). The
 * line names stay as the customer saw them; options are the Russian ones when
 * the catalog knows the line, else the customer's text.
 */
export function buildShopStaffNotes(
  req: ShopCheckoutRequest,
  opts: { test?: boolean; lines?: readonly (ShopStaffNoteLine | null | undefined)[] } = {},
): string {
  const d = req.delivery;
  const delivery = [DELIVERY_LABEL_RU[d.method], d.city, d.address].filter(Boolean).join(", ");
  const head = `Сайт · ${delivery}${d.note ? ` (${d.note})` : ""}`;
  const rows: string[] = [opts.test ? `${SHOP_TEST_ORDER_NOTE_PREFIX} ${head}` : head];
  req.lines.forEach((l, i) => {
    const info = opts.lines?.[i];
    const options: string | undefined = info?.optionsRu != null ? info.optionsRu.trim() : l.optionsText;
    const parts = [l.title, options, info ? `${info.quantity} шт.` : undefined, l.note ? `прим.: ${l.note}` : undefined].filter(
      Boolean,
    );
    rows.push(`${i + 1}) ${parts.join(" — ")}`);
  });
  const text = rows.join("\n");
  return text.length > 500 ? `${text.slice(0, 499)}…` : text;
}

/** Russian options of each priced line from the live catalog (null per line / all when unknown). Never throws. */
async function staffNoteLines(
  lines: readonly { input: PublicQuoteLineInput; priced: { quantity: number } }[],
): Promise<ShopStaffNoteLine[]> {
  let labels: ShopLineLabels | null = null;
  try {
    labels = await loadShopLineLabels("ru");
  } catch {
    labels = null;
  }
  const t = shopT("ru");
  return lines.map(({ input, priced }) => {
    let optionsRu: string | null = null;
    try {
      optionsRu = labels ? (describeQuoteLine(input as ShopQuoteLine, labels, t)?.optionsText ?? null) : null;
    } catch {
      optionsRu = null;
    }
    return { quantity: priced.quantity, optionsRu };
  });
}

function invalid(fieldErrors: Record<string, string>): ShopCheckoutResponse {
  return { status: 400, body: { error: "invalid_input", fieldErrors } };
}

/**
 * First cart line asking for more than its stock variant holds (lines of one
 * variant add up), or null. Reads balances only; never writes.
 */
export async function checkShopStock(lines: readonly PublicQuoteLineInput[]): Promise<StockShortage | null> {
  const itemIds: string[] = dtfStockItemIds(lines);
  const dtfVariants = itemIds.length
    ? await prisma.stockVariant.findMany({
        where: { itemId: { in: itemIds }, isActive: true },
        select: { id: true, itemId: true, options: true, label: true, sortOrder: true },
      })
    : [];
  const demands = shopStockDemands(lines, dtfVariants);
  if (demands.length === 0) return null;
  const rows = await prisma.stockVariant.findMany({
    where: { id: { in: [...new Set(demands.map((d) => d.variantId))] } },
    select: { id: true, stockQuantity: true },
  });
  const balances = new Map<string, number | null>(
    rows.map((r) => [r.id, r.stockQuantity == null ? null : Number(r.stockQuantity.toString())]),
  );
  return findStockShortage(demands, balances);
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
    if (kindNeedsFile(p.line.kind) && !(req.lines[i]!.files?.length)) {
      return { ok: false, response: invalid({ [`lines.${i}.files`]: "required" }) };
    }
    if (p.line.kind === "businessCard" && p.line.pricing === "shopPack") {
      const problem = shopBcFilesProblem(p.line.sides, req.lines[i]!.files ?? []);
      if (problem) return { ok: false, response: invalid({ [`lines.${i}.files`]: problem }) };
    }
    lines.push({ input: p.line, priced: q, source: req.lines[i]! });
  }

  const limitError = await checkShopDtfItemLimits(lines.map((l) => l.input));
  if (limitError) {
    return {
      ok: false,
      response: {
        status: 422,
        body: { error: "line_unavailable", index: limitError.index, reason: "invalid", code: limitError.code },
      },
    };
  }

  const short = shopStockCheckEnabled(env) ? await checkShopStock(lines.map((l) => l.input)) : null;
  if (short) {
    return {
      ok: false,
      response: {
        status: 422,
        body: {
          error: "line_unavailable",
          index: short.index,
          reason: "out_of_stock",
          code: "out_of_stock",
          available: short.available,
          ...(short.size ? { size: short.size } : {}),
        },
      },
    };
  }

  const subtotal = round2(lines.reduce((s, l) => s + l.priced.total, 0));
  const deliveryPrice = shopDeliveryPriceMdl(req.delivery.method, env);
  return { ok: true, req, lines, subtotal, deliveryPrice, total: round2(subtotal + deliveryPrice) };
}

/**
 * Business-card pack: one file per printed face (front; back when
 * double-sided). A file without a zone is the front. «required» when a face
 * has no file, «too_many» when a file is extra (a back for a one-sided card).
 */
export function shopBcFilesProblem(
  sides: "one" | "two",
  files: readonly { zone?: string }[],
): "required" | "too_many" | null {
  const zones: string[] = files.map((f) => (f.zone === "back" ? "back" : "front"));
  const need = shopBcRequiredZones(sides);
  if (need.some((z) => !zones.includes(z))) return "required";
  if (zones.length !== need.length || new Set(zones).size !== zones.length) return "too_many";
  return null;
}

/**
 * Bags / toys: the first line asking for a side or a print size its item
 * cannot take (see `shopDtfItemLimitError`), or null.
 */
async function checkShopDtfItemLimits(
  inputs: readonly PublicQuoteLineInput[],
): Promise<{ index: number; code: string } | null> {
  const dtf = inputs.flatMap((l, index) => (l.kind === "dtf" ? [{ line: l, index }] : []));
  if (dtf.length === 0) return null;
  const itemIds: string[] = [...new Set(dtf.map((d) => dtfGarmentStockItemId(d.line.garmentId)))];
  const presetIds: string[] = [...new Set(dtf.flatMap((d) => d.line.zones.flatMap((z) => (z.presetId ? [z.presetId] : []))))];
  const [items, presets] = await Promise.all([
    prisma.stockItem.findMany({ where: { id: { in: itemIds } }, select: { id: true, sku: true, attributes: true } }),
    presetIds.length
      ? prisma.printPricePreset.findMany({ where: { id: { in: presetIds } }, select: { id: true, widthCm: true, heightCm: true } })
      : Promise.resolve([]),
  ]);
  const itemById = new Map<string, ShopDtfItemRow>(items.map((i) => [i.id, { sku: i.sku, attributes: i.attributes }]));
  const presetById = new Map(presets.map((p) => [p.id, { widthCm: Number(p.widthCm), heightCm: Number(p.heightCm) }]));
  for (const d of dtf) {
    const code = shopDtfItemLimitError(
      d.line,
      itemById.get(dtfGarmentStockItemId(d.line.garmentId)) ?? null,
      (id) => presetById.get(id) ?? null,
    );
    if (code) return { index: d.index, code };
  }
  return null;
}

export interface ShopCheckoutOptions {
  /** Caller holds a tester pass or a staff session (may use the test payment in production). */
  tester?: boolean;
  /**
   * Signed-in storefront account (`shop_session`): the order is linked to it
   * and its stored files (`shop-orders/…`, «Repetă comanda») may be reused.
   * Without it the order is linked to the account of the checkout e-mail
   * (found or created — never signed in from here).
   */
  customerId?: string | null;
}

/**
 * Account the new order belongs to: the signed-in one, else the account of
 * the checkout e-mail (created on first use, seeded with name / phone /
 * delivery). No e-mail and no session → a guest order (null). Never throws.
 */
export async function resolveCheckoutCustomerId(req: ShopCheckoutRequest, sessionCustomerId?: string | null): Promise<string | null> {
  if (sessionCustomerId) return sessionCustomerId;
  if (!req.customer.email) return null;
  try {
    const d = req.delivery;
    const c = await findOrCreateShopCustomer(req.customer.email, {
      name: req.customer.name,
      phone: req.customer.phone,
      delivery: { method: d.method, ...(d.city ? { city: d.city } : {}), ...(d.address ? { address: d.address } : {}) },
      locale: req.locale,
    });
    return c.id;
  } catch (e) {
    console.error("[shop-checkout] account link failed:", e);
    return null;
  }
}

/** Order pipeline for every line not already resolved (business-card packs), in cart order. */
async function resolveShopOrderLines(
  lineInputs: AdminOrderLineInput[],
  preResolved: ReadonlyMap<number, ResolvedAdminOrderLine>,
): Promise<ResolvedAdminOrderLine[]> {
  const rest: number[] = lineInputs.map((_, i) => i).filter((i) => !preResolved.has(i));
  const { resolved: restResolved } = rest.length
    ? await resolveOrderLines(rest.map((i) => lineInputs[i]!))
    : { resolved: [] as ResolvedAdminOrderLine[] };
  return lineInputs.map((_, i) => preResolved.get(i) ?? restResolved[rest.indexOf(i)]!);
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
  /** Business-card packs, resolved here (shop price, default paper) instead of by the order pipeline. */
  const preResolved = new Map<number, ResolvedAdminOrderLine>();
  for (let i = 0; i < lines.length; i++) {
    const { input, priced: q, source } = lines[i]!;
    const copied: { fileKey: string; fileName: string; zone?: string }[] = [];
    for (const f of source.files ?? []) {
      // «Repetă comanda»: the signed-in owner's stored file is reused as is.
      const key = f.fileKey.startsWith(SHOP_ORDER_FILE_PREFIX)
        ? (await ownsReusableShopFile(opts.customerId, f.fileKey))
          ? f.fileKey
          : null
        : await copyUploadToShopOrders(f.fileKey);
      if (!key) return { status: 400, body: { error: "file_not_found", index: i, fileKey: f.fileKey } };
      copied.push({ fileKey: key, fileName: f.fileName, ...(f.zone ? { zone: f.zone } : {}) });
    }
    const zoneIds: string[] = input.kind === "dtf" ? input.zones.map((z) => z.id) : [];
    const adminInput = shopLineToAdminInput(input, q, shopLineFiles(input.kind, copied, q.quantity, zoneIds));
    if ("error" in adminInput) {
      return { status: 422, body: { error: "line_unavailable", index: i, reason: adminInput.error } };
    }
    if (input.kind === "businessCard" && input.pricing === "shopPack") {
      try {
        const bc = await resolveShopBusinessCardLine(input);
        const withPaper: AdminOrderLineInput = { ...adminInput, sheetPaperId: bc.sheetPaperId };
        preResolved.set(i, {
          input: withPaper,
          businessCardExtras: {
            sheetPaperId: bc.sheetPaperId,
            businessCardLineData: bc.businessCardLineData as unknown as Prisma.InputJsonValue,
            sheetsUsed: bc.sheetsUsed,
          },
        });
      } catch (e) {
        if (e instanceof AdminOrderResolveError) {
          return { status: 422, body: { error: "line_unavailable", index: i, reason: "invalid", code: e.message } };
        }
        throw e;
      }
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

  let resolved: ResolvedAdminOrderLine[];
  try {
    resolved = await resolveShopOrderLines(lineInputs, preResolved);
  } catch (e) {
    if (e instanceof AdminOrderResolveError) {
      return { status: 422, body: { error: "line_unavailable", index: null, reason: "invalid", code: e.message } };
    }
    throw e;
  }

  const isTest = provider.name === "test";
  const clientId = isTest ? null : await findClientIdByOrderPhone(req.customer.phone);
  const denorm = buildOrderDenormalizedScalars(computeOrderProductTypeForAdmin(resolved), resolved);
  const shopCustomerId = await resolveCheckoutCustomerId(req, opts.customerId);

  const order = await createOrderWithResolvedLines({
    order: {
      phone: req.customer.phone,
      clientName: req.customer.name,
      clientId: clientId ?? undefined,
      notes: buildShopStaffNotes(req, { test: isTest, lines: await staffNoteLines(lines) }),
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
      shopCustomerId,
      shopLocale: req.locale,
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
