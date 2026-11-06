/**
 * Dealer edit / cancel of own cabinet orders (stage 1), end to end on a real
 * database: the cabinet route handlers run in-process with real sessions
 * (only the request cookie is injected), real Prisma, real stock ledger.
 *
 * Needs a LOCAL database (refuses any other DATABASE_URL). Run with
 * `npx vitest run --config vitest.integration.config.ts tests/integration/dealer-order-modify.test.ts`.
 * No app server is needed.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

/** The `customer_session` cookie the handlers see (set per request). */
const cookieJar = vi.hoisted(() => ({ token: null as string | null }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "customer_session" && cookieJar.token ? { name, value: cookieJar.token } : undefined,
  }),
  headers: async () => new Headers(),
}));

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const env = readFileSync(path.resolve(__dirname, "../../.env"), "utf8");
    return /^DATABASE_URL="?([^"\n]+)"?/m.exec(env)?.[1] ?? "";
  } catch {
    return "";
  }
}
const DB_URL = databaseUrl();
const isLocalDb = /@(localhost|127\.0\.0\.1)[:/]/.test(DB_URL);

import { prisma } from "@/lib/prisma";
import { createSession, hashPassword } from "@/lib/auth";
import { GET as listOrders, POST as createOrder } from "@/app/api/cabinet/orders/route";
import { GET as getOrder, PUT as putOrder } from "@/app/api/cabinet/orders/[id]/route";
import { POST as cancelOrder } from "@/app/api/cabinet/orders/[id]/cancel/route";
import { GET as getEditSource } from "@/app/api/cabinet/orders/[id]/edit/route";
import { dealerCancelOrder, dealerEditOrder, DealerOrderModifyError } from "@/lib/orderCreate/dealerOrderModify";
import { fetchWorkshopBoardData } from "@/lib/fetchWorkshopBoardData";
import { cleanupTestMugs, createTestMug, mugStock } from "./mugSeed";

const MUG_PRICE = 100;
const minimalMugLayout = {
  templateId: "text_photo" as const,
  text: "",
  fontFamily: "Roboto",
  textColor: "#000000",
  backgroundColor: "transparent",
  photoUrls: [] as string[],
  photoSettings: [] as Array<{ fitMode: "cover" | "contain"; alignment: "left" | "center" | "right" }>,
};

/** Keys that must never be in a cabinet answer (costs / internal pricing). */
const COST_KEY = /cost|purchase|margin|profit|consumption|dealerPrice|avgPurchase/i;
function costKeyPaths(value: unknown, p = ""): string[] {
  if (value == null || typeof value !== "object") return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const here = p ? `${p}.${k}` : k;
    const empty = v != null && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0;
    if (COST_KEY.test(k) && !empty) out.push(here);
    out.push(...costKeyPaths(v, here));
  }
  return out;
}

type Party = { customerId: string; userId: string; token: string };

const stamp = `${Date.now()}`.slice(-7);
let seq = 0;
async function makeCustomer(isDealer: boolean): Promise<Party> {
  seq += 1;
  const phone = `+3736${stamp}${seq}`;
  const customer = await prisma.studioCustomer.create({
    data: { kind: "INDIVIDUAL", phone, personName: `IT dealer ${stamp}-${seq}`, isDealer },
  });
  const user = await prisma.user.create({
    data: {
      name: `it-dealer-${stamp}-${seq}@anvi.test`,
      role: "customer",
      password: hashPassword("x-not-used"),
      studioCustomerId: customer.id,
    },
  });
  return { customerId: customer.id, userId: user.id, token: await createSession(user.id) };
}

function as(party: Party | { token: string } | null) {
  cookieJar.token = party?.token ?? null;
}

function req(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

/** Net stock this order holds per variant (sale − return), from the unified ledger. */
async function heldByOrder(orderId: string): Promise<Map<string, number>> {
  const rows = await prisma.stockMovement.findMany({
    where: { orderId, kind: { in: ["ORDER_SALE", "ORDER_RETURN"] } },
    select: { variantId: true, delta: true },
  });
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.variantId, Math.round(((m.get(r.variantId) ?? 0) - Number(r.delta)) * 1e6) / 1e6);
  return m;
}

/** «De plată» the way `clientDebt.ts` / the admin registry computes it. */
async function debtOf(customerId: string): Promise<number> {
  const agg = await prisma.order.aggregate({
    where: { clientId: customerId, deletedAt: null, isPaid: false },
    _sum: { price: true },
  });
  return Number(agg._sum.price ?? 0);
}

describe.skipIf(!isLocalDb)("integration: dealer edit / cancel own orders", () => {
  let mugId: string;
  let dealer: Party;
  let otherDealer: Party;
  let retail: Party;
  let staffToken: string;
  let staffId: string;

  beforeAll(async () => {
    mugId = (await createTestMug(80, { sellPrice: MUG_PRICE, skuPrefix: "IT-DEALER-EDIT" })).id;
    dealer = await makeCustomer(true);
    otherDealer = await makeCustomer(true);
    retail = await makeCustomer(false);
    const staff = await prisma.user.create({
      data: { name: `it-staff-${stamp}@anvi.test`, role: "admin", password: hashPassword("x") },
    });
    staffId = staff.id;
    staffToken = await createSession(staff.id);
  });

  afterAll(async () => {
    const clientIds = [dealer, otherDealer, retail].filter(Boolean).map((p) => p.customerId);
    await prisma.order.deleteMany({ where: { clientId: { in: clientIds } } });
    await cleanupTestMugs([mugId]);
    await prisma.user.deleteMany({ where: { id: { in: [dealer.userId, otherDealer.userId, retail.userId, staffId] } } });
    await prisma.studioCustomer.deleteMany({ where: { id: { in: clientIds } } });
    await prisma.$disconnect();
  });

  beforeEach(() => as(null));

  /** A dealer order of `copies` mugs, created through the real cabinet POST. */
  async function createDealerOrder(copies: number, owner: Party = dealer, fileName = "front.png") {
    as(owner);
    const res = await createOrder(
      req("/api/cabinet/orders", "POST", {
        notes: "first",
        lines: [
          {
            productType: "mug",
            mugProductId: mugId,
            mugLayoutData: minimalMugLayout,
            files: [{ fileName, fileUrl: `uploads/it-dealer/${fileName}`, copies, color: "color" }],
          },
        ],
      }),
    );
    const body = await json(res);
    expect(res.status, JSON.stringify(body)).toBe(201);
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: body.id as string },
      include: { orderLines: { include: { files: true } } },
    });
    as(null);
    return order;
  }

  function editBody(order: Awaited<ReturnType<typeof createDealerOrder>>, files: unknown[], extra: Record<string, unknown> = {}) {
    return {
      notes: "changed",
      ...extra,
      lines: [{ orderLineId: order.orderLines[0]!.id, productType: "mug", mugProductId: mugId, files }],
    };
  }

  // ─── Authorization ──────────────────────────────────────────────────────

  describe("who may edit / cancel", () => {
    it("unauthenticated: 401 for edit, cancel and the edit prefill", async () => {
      const order = await createDealerOrder(1);
      as(null);
      expect((await putOrder(req(`/api/cabinet/orders/${order.id}`, "PUT", editBody(order, [])), ctx(order.id))).status).toBe(401);
      expect((await cancelOrder(req(`/api/cabinet/orders/${order.id}/cancel`, "POST", { reason: "test" }), ctx(order.id))).status).toBe(401);
      expect((await getEditSource(req(`/api/cabinet/orders/${order.id}/edit`, "GET"), ctx(order.id))).status).toBe(401);
    });

    it("staff session token in the cabinet: 401 (customers only)", async () => {
      const order = await createDealerOrder(1);
      as({ token: staffToken });
      const r = await cancelOrder(req(`/api/cabinet/orders/${order.id}/cancel`, "POST", { reason: "staff try" }), ctx(order.id));
      expect(r.status).toBe(401);
      const u = await putOrder(
        req(`/api/cabinet/orders/${order.id}`, "PUT", editBody(order, [{ fileId: order.orderLines[0]!.files[0]!.id, copies: 2 }])),
        ctx(order.id),
      );
      expect(u.status).toBe(401);
      expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).deletedAt).toBeNull();
    });

    it("non-dealer client: 403", async () => {
      const order = await createDealerOrder(1);
      // Even an order on the retail client's own account.
      await prisma.order.update({ where: { id: order.id }, data: { clientId: retail.customerId } });
      as(retail);
      expect((await cancelOrder(req(`/x`, "POST", { reason: "retail try" }), ctx(order.id))).status).toBe(403);
      expect((await putOrder(req(`/x`, "PUT", editBody(order, [])), ctx(order.id))).status).toBe(403);
      expect((await getEditSource(req(`/x`, "GET"), ctx(order.id))).status).toBe(403);
      await prisma.order.update({ where: { id: order.id }, data: { clientId: dealer.customerId } });
    });

    it("another dealer's order: same 404 as a missing order, nothing changes", async () => {
      const order = await createDealerOrder(2);
      const stockBefore = await mugStock(mugId);
      as(otherDealer);
      const foreignCancel = await cancelOrder(req(`/x`, "POST", { reason: "not mine" }), ctx(order.id));
      const missingCancel = await cancelOrder(req(`/x`, "POST", { reason: "not mine" }), ctx("00000000-0000-4000-8000-00000000dead"));
      expect(foreignCancel.status).toBe(404);
      expect(missingCancel.status).toBe(404);
      expect(await foreignCancel.json()).toEqual(await missingCancel.json());

      const foreignPut = await putOrder(
        req(`/x`, "PUT", editBody(order, [{ fileId: order.orderLines[0]!.files[0]!.id, copies: 9 }])),
        ctx(order.id),
      );
      expect(foreignPut.status).toBe(404);
      expect(await foreignPut.json()).toEqual({ error: "Not found" });
      expect((await getEditSource(req(`/x`, "GET"), ctx(order.id))).status).toBe(404);
      expect((await getOrder(req(`/x`, "GET"), ctx(order.id))).status).toBe(404);

      const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { files: true } });
      expect(after.deletedAt).toBeNull();
      expect(after.files[0]!.copies).toBe(2);
      expect(await mugStock(mugId)).toBe(stockBefore);
    });

    it("an order deleted by the staff is a 404 for the dealer", async () => {
      const order = await createDealerOrder(1);
      await prisma.order.update({ where: { id: order.id }, data: { deletedAt: new Date() } });
      as(dealer);
      expect((await cancelOrder(req(`/x`, "POST", { reason: "gone" }), ctx(order.id))).status).toBe(404);
      expect((await getOrder(req(`/x`, "GET"), ctx(order.id))).status).toBe(404);
    });
  });

  // ─── Locked statuses ────────────────────────────────────────────────────

  describe("locked orders", () => {
    const LOCKED = ["WORKSHOP_PRINTING", "WORKSHOP_READY", "READY_IN_STUDIO", "RETURNED_TO_STUDIO", "DELIVERED"] as const;

    it.each(LOCKED)("%s: edit and cancel answer 409 and change nothing", async (status) => {
      const order = await createDealerOrder(1);
      await prisma.order.update({ where: { id: order.id }, data: { status } });
      const stockBefore = await mugStock(mugId);
      const movesBefore = await prisma.stockMovement.count({ where: { orderId: order.id } });
      as(dealer);

      const put = await putOrder(
        req(`/x`, "PUT", editBody(order, [{ fileId: order.orderLines[0]!.files[0]!.id, copies: 4 }])),
        ctx(order.id),
      );
      expect(put.status).toBe(409);
      expect(await put.json()).toMatchObject({ code: "order_locked" });
      const cancel = await cancelOrder(req(`/x`, "POST", { reason: "too late" }), ctx(order.id));
      expect(cancel.status).toBe(409);
      expect((await getEditSource(req(`/x`, "GET"), ctx(order.id))).status).toBe(409);

      const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { files: true } });
      expect(after.status).toBe(status);
      expect(after.deletedAt).toBeNull();
      expect(after.cancelledAt).toBeNull();
      expect(after.dealerEditedAt).toBeNull();
      expect(after.files[0]!.copies).toBe(1);
      expect(await mugStock(mugId)).toBe(stockBefore);
      expect(await prisma.stockMovement.count({ where: { orderId: order.id } })).toBe(movesBefore);

      const detail = await json(await getOrder(req(`/x`, "GET"), ctx(order.id)));
      expect(detail.dealerActions).toBe(status === "WORKSHOP_PRINTING" ? "locked" : "hidden");
    });

    it("paid order: 409 (reason «paid»), plaque state «locked»", async () => {
      const order = await createDealerOrder(1);
      await prisma.order.update({ where: { id: order.id }, data: { isPaid: true, paidAt: new Date() } });
      as(dealer);
      const cancel = await cancelOrder(req(`/x`, "POST", { reason: "paid already" }), ctx(order.id));
      expect(cancel.status).toBe(409);
      expect(await cancel.json()).toMatchObject({ code: "order_locked", reason: "paid" });
      const detail = await json(await getOrder(req(`/x`, "GET"), ctx(order.id)));
      expect(detail.dealerActions).toBe("locked");
      expect(detail.dealerLockReason).toBe("paid");
    });

    it.each(["NEW", "IN_PROGRESS", "SENT_TO_WORKSHOP", "ISSUE"] as const)(
      "%s: the detail offers edit / cancel",
      async (status) => {
        const order = await createDealerOrder(1);
        await prisma.order.update({ where: { id: order.id }, data: { status } });
        as(dealer);
        const detail = await json(await getOrder(req(`/x`, "GET"), ctx(order.id)));
        expect(detail.dealerActions).toBe("editable");
      },
    );
  });

  // ─── Race with the staff ────────────────────────────────────────────────

  describe("race: staff sets WORKSHOP_PRINTING before the dealer's write commits", () => {
    it("edit fails cleanly: no stock moved, files, price and log untouched", async () => {
      const order = await createDealerOrder(3);
      const fileId = order.orderLines[0]!.files[0]!.id;
      const stockBefore = await mugStock(mugId);
      const movesBefore = await prisma.stockMovement.count({ where: { orderId: order.id } });

      const attempt = dealerEditOrder({
        orderId: order.id,
        actor: { userId: dealer.userId, studioCustomerId: dealer.customerId },
        input: { lines: [{ orderLineId: order.orderLines[0]!.id, productType: "mug", mugProductId: mugId, files: [{ fileId, copies: 7 }] }] },
        hooks: {
          // The pre-check already passed; the staff flips the status on another connection.
          beforeLock: async () => {
            await prisma.order.update({ where: { id: order.id }, data: { status: "WORKSHOP_PRINTING" } });
          },
        },
      });
      await expect(attempt).rejects.toMatchObject({ code: "order_locked", block: "printing" });
      await expect(attempt).rejects.toBeInstanceOf(DealerOrderModifyError);

      const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { files: true, orderLines: true } });
      expect(after.status).toBe("WORKSHOP_PRINTING");
      expect(after.dealerEditedAt).toBeNull();
      expect(Number(after.price)).toBe(3 * MUG_PRICE);
      expect(after.files.map((f) => [f.id, f.copies])).toEqual([[fileId, 3]]);
      expect(after.orderLines.map((l) => l.id)).toEqual([order.orderLines[0]!.id]);
      expect(await mugStock(mugId)).toBe(stockBefore);
      expect(await prisma.stockMovement.count({ where: { orderId: order.id } })).toBe(movesBefore);
      expect(await prisma.orderFileArchive.count({ where: { orderId: order.id } })).toBe(0);
      expect(await prisma.orderLog.count({ where: { orderId: order.id, action: "dealer_edited" } })).toBe(0);
    });

    it("cancel fails cleanly: not cancelled, stock still held", async () => {
      const order = await createDealerOrder(2);
      const stockBefore = await mugStock(mugId);
      const attempt = dealerCancelOrder({
        orderId: order.id,
        actor: { userId: dealer.userId, studioCustomerId: dealer.customerId },
        reason: "race",
        hooks: {
          beforeLock: async () => {
            await prisma.order.update({ where: { id: order.id }, data: { status: "WORKSHOP_PRINTING" } });
          },
        },
      });
      await expect(attempt).rejects.toMatchObject({ code: "order_locked", block: "printing" });
      const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(after.deletedAt).toBeNull();
      expect(after.cancelledAt).toBeNull();
      expect(await mugStock(mugId)).toBe(stockBefore);
      expect((await heldByOrder(order.id)).get(mugId)).toBe(2);
    });

    it("the edit holds the row lock: a concurrent staff status write waits for the commit", async () => {
      const order = await createDealerOrder(1);
      const fileId = order.orderLines[0]!.files[0]!.id;
      let staffWrite: Promise<unknown> | null = null;
      let staffFinishedWhileLocked = false;
      await dealerEditOrder({
        orderId: order.id,
        actor: { userId: dealer.userId, studioCustomerId: dealer.customerId },
        input: { lines: [{ orderLineId: order.orderLines[0]!.id, productType: "mug", mugProductId: mugId, files: [{ fileId, copies: 2 }] }] },
        hooks: {
          afterLock: async () => {
            // Staff sets «printing» on another connection while the dealer's transaction holds the row.
            let done = false;
            staffWrite = prisma.order
              .update({ where: { id: order.id }, data: { status: "WORKSHOP_PRINTING" } })
              .then(() => {
                done = true;
              });
            await new Promise((r) => setTimeout(r, 300));
            staffFinishedWhileLocked = done;
          },
        },
      });
      await staffWrite;
      expect(staffFinishedWhileLocked).toBe(false);
      const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { files: true } });
      // Both writes land, in order: the edit, then «printing» (which now locks the order).
      expect(after.status).toBe("WORKSHOP_PRINTING");
      expect(after.files[0]!.copies).toBe(2);
      expect(after.dealerEditedAt).not.toBeNull();
    });
  });

  // ─── Edit ───────────────────────────────────────────────────────────────

  describe("edit", () => {
    it("reprices on the server, ignores injected prices / costs, re-deducts stock exactly, logs, keeps old files", async () => {
      const startStock = await mugStock(mugId);
      const order = await createDealerOrder(3, dealer, "old.png");
      expect(await mugStock(mugId)).toBe(startStock - 3);
      expect(Number(order.price)).toBe(3 * MUG_PRICE);
      const oldFile = order.orderLines[0]!.files[0]!;

      // Dry run: price only, nothing saved.
      as(dealer);
      const dry = await putOrder(
        req(`/x`, "PUT", editBody(order, [{ fileId: oldFile.id, copies: 5 }], { dryRun: true })),
        ctx(order.id),
      );
      const dryBody = await json(dry);
      expect(dry.status).toBe(200);
      // Totals only (+ the «Срочно» quote: offer and state, no costs).
      expect(dryBody).toEqual({
        lineTotalsMdl: [5 * MUG_PRICE],
        totalMdl: 5 * MUG_PRICE,
        goodsTotalMdl: 5 * MUG_PRICE,
        urgency: { available: true, feeMdl: expect.any(Number), state: "off", orderFeeMdl: null },
      });
      expect(await mugStock(mugId)).toBe(startStock - 3);

      // Real edit: replace the file with a new upload of 5 copies, with injected money fields.
      const res = await putOrder(
        req(`/x`, "PUT", {
          notes: "new notes",
          price: 1,
          totalMdl: 1,
          costMdl: 0,
          isPaid: true,
          status: "DELIVERED",
          clientId: otherDealer.customerId,
          lines: [
            {
              orderLineId: order.orderLines[0]!.id,
              productType: "mug",
              mugProductId: mugId,
              customerType: "retail",
              price: 1,
              unitPriceMdl: 1,
              purchaseCost: 0,
              files: [{ fileName: "new.png", fileUrl: "uploads/it-dealer/new.png", copies: 5, color: "color", price: 1 }],
            },
          ],
        }),
        ctx(order.id),
      );
      const body = await json(res);
      expect(res.status, JSON.stringify(body)).toBe(200);
      expect(body).toEqual({ id: order.id, price: 5 * MUG_PRICE, urgent: false, urgencyFeeMdl: null });
      expect(costKeyPaths(body)).toEqual([]);

      const after = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
        include: { files: true, orderLines: true },
      });
      expect(Number(after.price)).toBe(5 * MUG_PRICE);
      expect(after.isPaid).toBe(false);
      expect(after.status).toBe("SENT_TO_WORKSHOP");
      expect(after.clientId).toBe(dealer.customerId);
      expect(after.notes).toBe("new notes");
      expect(after.dealerEditedAt).not.toBeNull();
      expect(after.files.map((f) => [f.fileName, f.copies])).toEqual([["new.png", 5]]);

      // Stock: old 3 returned, new 5 taken — exactly.
      expect(await mugStock(mugId)).toBe(startStock - 5);
      expect((await heldByOrder(order.id)).get(mugId)).toBe(5);

      // Old file kept for the staff.
      const archived = await prisma.orderFileArchive.findMany({ where: { orderId: order.id } });
      expect(archived).toHaveLength(1);
      expect(archived[0]).toMatchObject({
        fileName: "old.png",
        fileUrl: "uploads/it-dealer/old.png",
        copies: 3,
        lineProductType: "mug",
        reason: "dealer_edit",
        archivedById: dealer.userId,
      });

      // History.
      const log = await prisma.orderLog.findFirstOrThrow({ where: { orderId: order.id, action: "dealer_edited" } });
      expect(log.userId).toBe(dealer.userId);
      expect(log.oldValue).toBe(String(3 * MUG_PRICE));
      expect(log.newValue).toBe(String(5 * MUG_PRICE));
      expect((log.metadata as { archivedFiles: { id: string; fileName: string }[] }).archivedFiles).toEqual([
        { id: archived[0]!.id, fileName: "old.png" },
      ]);

      // A second edit that keeps the file by id: only copies change, nothing archived.
      const keep = await putOrder(
        req(`/x`, "PUT", {
          lines: [
            {
              orderLineId: after.orderLines[0]!.id,
              productType: "mug",
              mugProductId: mugId,
              files: [{ fileId: after.files[0]!.id, copies: 2 }],
            },
          ],
        }),
        ctx(order.id),
      );
      expect(keep.status).toBe(200);
      expect(await mugStock(mugId)).toBe(startStock - 2);
      expect((await heldByOrder(order.id)).get(mugId)).toBe(2);
      expect(await prisma.orderFileArchive.count({ where: { orderId: order.id } })).toBe(1);
      expect(await prisma.orderLog.count({ where: { orderId: order.id, action: "dealer_edited" } })).toBe(2);
      // Notes left out: kept.
      expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).notes).toBe("new notes");
    });

    it("refuses a file of another order", async () => {
      const mine = await createDealerOrder(1);
      const theirs = await createDealerOrder(1, otherDealer);
      as(dealer);
      const res = await putOrder(
        req(`/x`, "PUT", editBody(mine, [{ fileId: theirs.orderLines[0]!.files[0]!.id, copies: 1 }])),
        ctx(mine.id),
      );
      expect(res.status).toBe(400);
      const theirFile = await prisma.file.findUniqueOrThrow({ where: { id: theirs.orderLines[0]!.files[0]!.id } });
      expect(theirFile.orderId).toBe(theirs.id);
    });

    it("the edit prefill and the detail carry no costs", async () => {
      const order = await createDealerOrder(2);
      as(dealer);
      const src = await getEditSource(req(`/x`, "GET"), ctx(order.id));
      const srcBody = await json(src);
      expect(src.status).toBe(200);
      expect(costKeyPaths(srcBody)).toEqual([]);
      const lines = srcBody.orderLines as { stockVariantId: string; files: { id: string; copies: number }[] }[];
      expect(lines[0]!.stockVariantId).toBe(mugId);
      expect(lines[0]!.files[0]).toMatchObject({ id: order.orderLines[0]!.files[0]!.id, copies: 2 });

      const detail = await json(await getOrder(req(`/x`, "GET"), ctx(order.id)));
      expect(costKeyPaths(detail)).toEqual([]);
      expect(detail).not.toHaveProperty("source");
      expect(detail).not.toHaveProperty("deletedAt");
    });
  });

  // ─── Cancel ─────────────────────────────────────────────────────────────

  describe("cancel", () => {
    it("requires a reason", async () => {
      const order = await createDealerOrder(1);
      as(dealer);
      for (const body of [{}, { reason: "" }, { reason: "   " }, { reason: "ab" }]) {
        const res = await cancelOrder(req(`/x`, "POST", body), ctx(order.id));
        expect(res.status).toBe(400);
        expect(await res.json()).toMatchObject({ code: "cancel_reason_required" });
      }
      expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).cancelledAt).toBeNull();
    });

    it("returns stock once, drops the debt, logs, stays visible to the dealer and leaves the board", async () => {
      const startStock = await mugStock(mugId);
      const order = await createDealerOrder(4);
      expect(await mugStock(mugId)).toBe(startStock - 4);

      as(dealer);
      const summaryBefore = (await json(await listOrders(req(`/api/cabinet/orders?limit=100`, "GET")))).summary as {
        totalDue: number;
        allCount: number;
      };
      const debtBefore = await debtOf(dealer.customerId);

      const staff = { id: staffId, name: "it", role: "admin" };
      const boardBefore = await fetchWorkshopBoardData(staff, { search: String(order.orderNumber) });
      const boardIds = (b: typeof boardBefore) => b.sections.flatMap((s) => s.groups.flatMap((g) => g.lines.map((l) => l.orderId)));
      expect(boardIds(boardBefore)).toContain(order.id);

      const res = await cancelOrder(req(`/x`, "POST", { reason: "  клиент передумал  " }), ctx(order.id));
      const body = await json(res);
      expect(res.status, JSON.stringify(body)).toBe(200);
      expect(costKeyPaths(body)).toEqual([]);

      const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(after.cancelledAt).not.toBeNull();
      expect(after.deletedAt).not.toBeNull();
      expect(after.cancelReason).toBe("клиент передумал");
      expect(after.cancelledById).toBe(dealer.userId);
      expect(after.status).toBe("SENT_TO_WORKSHOP");

      // Stock back exactly.
      expect(await mugStock(mugId)).toBe(startStock);
      expect((await heldByOrder(order.id)).get(mugId) ?? 0).toBe(0);
      const movesAfterFirst = await prisma.stockMovement.count({ where: { orderId: order.id } });

      // Debt.
      expect(await debtOf(dealer.customerId)).toBeCloseTo(debtBefore - 4 * MUG_PRICE, 2);
      const list = await json(await listOrders(req(`/api/cabinet/orders?limit=100`, "GET")));
      const summary = list.summary as { totalDue: number; allCount: number; statuses: string[] };
      expect(summary.totalDue).toBeCloseTo(summaryBefore.totalDue - 4 * MUG_PRICE, 2);
      expect(summary.allCount).toBe(summaryBefore.allCount);
      expect(summary.statuses).toContain("cancelled");

      // Log.
      const log = await prisma.orderLog.findFirstOrThrow({ where: { orderId: order.id, action: "cancelled_by_dealer" } });
      expect(log.userId).toBe(dealer.userId);
      expect(log.oldValue).toBe("SENT_TO_WORKSHOP");
      expect(log.metadata).toEqual({ reason: "клиент передумал" });

      // Cabinet list: still there, cancelled; the status filter finds it.
      const row = (list.orders as { id: string; cancelledAt: string | null }[]).find((o) => o.id === order.id);
      expect(row?.cancelledAt).toBeTruthy();
      const filtered = await json(await listOrders(req(`/api/cabinet/orders?limit=100&status=cancelled`, "GET")));
      expect((filtered.orders as { id: string }[]).map((o) => o.id)).toContain(order.id);
      const queued = await json(await listOrders(req(`/api/cabinet/orders?limit=100&status=queued`, "GET")));
      expect((queued.orders as { id: string }[]).map((o) => o.id)).not.toContain(order.id);
      // Pre-split filter value from an old open page still works (accepted + queued + printing).
      const legacy = await json(await listOrders(req(`/api/cabinet/orders?limit=100&status=inProgress`, "GET")));
      expect((legacy.orders as { id: string }[]).map((o) => o.id)).not.toContain(order.id);

      // Cabinet detail: greyed «Отменён» with the reason, no buttons, timeline ends with the cancel.
      const detailRes = await getOrder(req(`/x`, "GET"), ctx(order.id));
      expect(detailRes.status).toBe(200);
      const detail = await json(detailRes);
      expect(detail.cancelReason).toBe("клиент передумал");
      expect(detail.cancelledAt).toBeTruthy();
      expect(detail.dealerActions).toBe("hidden");
      const timeline = detail.statusTimeline as { status: string }[];
      expect(timeline[timeline.length - 1]!.status).toBe("cancelled");

      // Workshop board: gone.
      const boardAfter = await fetchWorkshopBoardData(staff, { search: String(order.orderNumber), includeDelivered: true });
      expect(boardIds(boardAfter)).not.toContain(order.id);

      // Cancelling twice: 409, no second return.
      const again = await cancelOrder(req(`/x`, "POST", { reason: "second time" }), ctx(order.id));
      expect(again.status).toBe(409);
      expect(await again.json()).toMatchObject({ code: "order_locked", reason: "cancelled" });
      expect(await mugStock(mugId)).toBe(startStock);
      expect(await prisma.stockMovement.count({ where: { orderId: order.id } })).toBe(movesAfterFirst);
      expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).cancelReason).toBe("клиент передумал");

      // And no edit after cancel.
      const put = await putOrder(req(`/x`, "PUT", editBody(order, [{ fileId: order.orderLines[0]!.files[0]!.id, copies: 1 }])), ctx(order.id));
      expect(put.status).toBe(409);
      expect(await mugStock(mugId)).toBe(startStock);
    });

    it("an edited order cancels back to the stock it held before the order", async () => {
      const startStock = await mugStock(mugId);
      const order = await createDealerOrder(2);
      as(dealer);
      const put = await putOrder(
        req(`/x`, "PUT", editBody(order, [{ fileId: order.orderLines[0]!.files[0]!.id, copies: 6 }])),
        ctx(order.id),
      );
      expect(put.status).toBe(200);
      expect(await mugStock(mugId)).toBe(startStock - 6);
      const res = await cancelOrder(req(`/x`, "POST", { reason: "after edit" }), ctx(order.id));
      expect(res.status).toBe(200);
      expect(await mugStock(mugId)).toBe(startStock);
      expect((await heldByOrder(order.id)).get(mugId) ?? 0).toBe(0);
    });
  });
});
