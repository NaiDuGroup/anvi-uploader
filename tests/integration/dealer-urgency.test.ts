/**
 * Dealer «Срочно» surcharge end to end on a real database: cabinet create /
 * edit, staff 🔥 / waive, settings + client card override, debt, invoice
 * picker. Route handlers run in-process with real sessions (only the request
 * cookies are injected), real Prisma, real stock ledger.
 *
 * Needs a LOCAL database (refuses any other DATABASE_URL). Run with
 * `npx vitest run --config vitest.integration.config.ts tests/integration/dealer-urgency.test.ts`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

/** Session cookies the handlers see (set per request). */
const cookieJar = vi.hoisted(() => ({ customer: null as string | null, admin: null as string | null }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      if (name === "customer_session" && cookieJar.customer) return { name, value: cookieJar.customer };
      if (name === "admin_session" && cookieJar.admin) return { name, value: cookieJar.admin };
      return undefined;
    },
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
const isLocalDb = /@(localhost|127\.0\.0\.1)[:/]/.test(databaseUrl());

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createSession, hashPassword } from "@/lib/auth";
import { GET as listOrders, POST as createOrder } from "@/app/api/cabinet/orders/route";
import { GET as getOrder, PUT as putOrder } from "@/app/api/cabinet/orders/[id]/route";
import { PATCH as patchOrder } from "@/app/api/orders/[id]/route";
import { DELETE as waiveFee } from "@/app/api/orders/[id]/urgency-fee/route";
import { PUT as putClientUrgency } from "@/app/api/admin/clients/[id]/urgency/route";
import { GET as getClient } from "@/app/api/admin/clients/[id]/route";
import { GET as ordersByClient } from "@/app/api/admin/orders/by-client/route";
import { PATCH as patchCompanyProfile } from "@/app/api/admin/company-profile/route";
import { GET as getAdminOrder, PATCH as patchAdminOrder } from "@/app/api/admin/orders/[id]/route";
import { GET as clientOrders } from "@/app/api/admin/clients/[id]/orders/route";
import { dealerEditOrder, DealerOrderModifyError } from "@/lib/orderCreate/dealerOrderModify";
import { fetchWorkshopBoardData } from "@/lib/fetchWorkshopBoardData";
import { fetchOrdersData } from "@/lib/fetchOrders";
import { orderToInvoiceLines } from "@/lib/invoice/orderInvoiceLines";
import { cleanupTestMugs, createTestMug } from "./mugSeed";

const minimalMugLayout = {
  templateId: "text_photo" as const,
  text: "",
  fontFamily: "Roboto",
  textColor: "#000000",
  backgroundColor: "transparent",
  photoUrls: [] as string[],
  photoSettings: [] as Array<{ fitMode: "cover" | "contain"; alignment: "left" | "center" | "right" }>,
};

type Party = { customerId: string; userId: string; token: string };

const stamp = `${Date.now()}`.slice(-7);
let seq = 0;
async function makeCustomer(isDealer: boolean, extra: Prisma.StudioCustomerUncheckedCreateInput | object = {}): Promise<Party> {
  seq += 1;
  const customer = await prisma.studioCustomer.create({
    data: {
      kind: "INDIVIDUAL",
      phone: `+3737${stamp}${seq}`,
      personName: `IT urgency ${stamp}-${seq}`,
      isDealer,
      ...extra,
    },
  });
  const user = await prisma.user.create({
    data: {
      name: `it-urg-${stamp}-${seq}@anvi.test`,
      role: "customer",
      password: hashPassword("x-not-used"),
      studioCustomerId: customer.id,
    },
  });
  return { customerId: customer.id, userId: user.id, token: await createSession(user.id) };
}

async function makeStaff(role: string): Promise<{ id: string; token: string }> {
  seq += 1;
  const u = await prisma.user.create({
    data: { name: `it-urg-staff-${stamp}-${seq}@anvi.test`, role, password: hashPassword("x") },
  });
  return { id: u.id, token: await createSession(u.id) };
}

function asCustomer(party: Party | null) {
  cookieJar.customer = party?.token ?? null;
  cookieJar.admin = null;
}
function asStaff(staff: { token: string } | null) {
  cookieJar.admin = staff?.token ?? null;
  cookieJar.customer = null;
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

/** «De plată» the way `clientDebt.ts` / the admin registry computes it. */
async function debtOf(customerId: string): Promise<number> {
  const agg = await prisma.order.aggregate({
    where: { clientId: customerId, deletedAt: null, isPaid: false },
    _sum: { price: true },
  });
  return Number(agg._sum.price ?? 0);
}

/** Every object in `tree` whose `orderId` is `orderId` (board lines). */
function findByOrderId(tree: unknown, orderId: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (o.orderId === orderId && "dealerUrgency" in o) out.push(o);
      Object.values(o).forEach(walk);
    }
  };
  walk(tree);
  return out;
}

const num = (d: Prisma.Decimal | null) => (d == null ? null : Number(d.toString()));

describe.skipIf(!isLocalDb)("integration: dealer «Срочно» surcharge", () => {
  let mugId: string;
  let dealer: Party;
  let ownFreeDealer: Party;
  let blockedDealer: Party;
  let retail: Party;
  let admin: { id: string; token: string };
  let superadmin: { id: string; token: string };
  let workshop: { id: string; token: string };
  let profileId: string;
  let originalGlobalFee: Prisma.Decimal;
  /** Dealer price of one test mug (from a dry run, not hard-coded). */
  let goods1: number;

  async function setGlobalFee(mdl: number) {
    await prisma.companyProfile.update({ where: { id: profileId }, data: { dealerUrgencyFeeMdl: mdl } });
  }

  beforeAll(async () => {
    mugId = (await createTestMug(200, { sellPrice: 100, skuPrefix: "IT-URGENCY" })).id;
    dealer = await makeCustomer(true);
    ownFreeDealer = await makeCustomer(true, { urgencyFeeMdl: 0 });
    blockedDealer = await makeCustomer(true, { urgencyDisabled: true });
    retail = await makeCustomer(false);
    admin = await makeStaff("admin");
    superadmin = await makeStaff("superadmin");
    workshop = await makeStaff("workshop");
    const profile =
      (await prisma.companyProfile.findFirst({ orderBy: { createdAt: "asc" } })) ??
      (await prisma.companyProfile.create({
        data: { name: "IT", fiscalCode: "1", address: "a", iban: "i", bankName: "b", bic: "c" },
      }));
    profileId = profile.id;
    originalGlobalFee = profile.dealerUrgencyFeeMdl;
    await setGlobalFee(50);

    asCustomer(dealer);
    const quote = await json(await createOrder(req("/api/cabinet/orders", "POST", { dryRun: true, lines: [mugLine(1)] })));
    goods1 = quote.totalMdl as number;
    expect(goods1).toBeGreaterThan(0);
  });

  afterAll(async () => {
    if (profileId) await prisma.companyProfile.update({ where: { id: profileId }, data: { dealerUrgencyFeeMdl: originalGlobalFee } });
    const parties = [dealer, ownFreeDealer, blockedDealer, retail].filter(Boolean);
    const clientIds = parties.map((p) => p.customerId);
    await prisma.order.deleteMany({ where: { clientId: { in: clientIds } } });
    await cleanupTestMugs([mugId]);
    await prisma.user.deleteMany({
      where: { id: { in: [...parties.map((p) => p.userId), admin?.id, superadmin?.id, workshop?.id].filter(Boolean) as string[] } },
    });
    await prisma.studioCustomer.deleteMany({ where: { id: { in: clientIds } } });
    await prisma.$disconnect();
  });

  beforeEach(() => asCustomer(null));

  function mugLine(copies: number, fileName = "front.png") {
    return {
      productType: "mug",
      mugProductId: mugId,
      mugLayoutData: minimalMugLayout,
      files: [{ fileName, fileUrl: `uploads/it-urgency/${fileName}`, copies, color: "color" }],
    };
  }

  async function create(owner: Party, body: Record<string, unknown>, copies = 1) {
    asCustomer(owner);
    const res = await createOrder(req("/api/cabinet/orders", "POST", { lines: [mugLine(copies)], ...body }));
    const out = await json(res);
    asCustomer(null);
    return { res, out };
  }

  async function createOk(owner: Party, body: Record<string, unknown>, copies = 1) {
    const { res, out } = await create(owner, body, copies);
    expect(res.status, JSON.stringify(out)).toBe(201);
    return prisma.order.findUniqueOrThrow({
      where: { id: out.id as string },
      include: { orderLines: { include: { files: true } } },
    });
  }

  type CreatedOrder = Awaited<ReturnType<typeof createOk>>;

  function editBody(order: CreatedOrder, extra: Record<string, unknown> = {}, copies?: number) {
    const f = order.orderLines[0]!.files[0]!;
    return {
      ...extra,
      lines: [
        {
          orderLineId: order.orderLines[0]!.id,
          productType: "mug",
          mugProductId: mugId,
          files: [{ fileId: f.id, ...(copies ? { copies } : {}) }],
        },
      ],
    };
  }

  async function put(owner: Party, order: CreatedOrder, extra: Record<string, unknown>, copies?: number) {
    asCustomer(owner);
    const res = await putOrder(req(`/api/cabinet/orders/${order.id}`, "PUT", editBody(order, extra, copies)), ctx(order.id));
    const out = await json(res);
    asCustomer(null);
    return { res, out };
  }

  const logsOf = (orderId: string, action: string) =>
    prisma.orderLog.findMany({ where: { orderId, action }, orderBy: { createdAt: "asc" } });

  // ─── Create ─────────────────────────────────────────────────────────────

  describe("cabinet create", () => {
    it("dry run quotes the offer from the dealer's card / global setting", async () => {
      asCustomer(dealer);
      const plain = await json(await createOrder(req("/api/cabinet/orders", "POST", { dryRun: true, lines: [mugLine(1)] })));
      expect(plain.urgency).toEqual({ available: true, feeMdl: 50, state: "off" });
      expect(plain.totalMdl).toBe(goods1);
      const urgent = await json(
        await createOrder(req("/api/cabinet/orders", "POST", { dryRun: true, urgent: true, lines: [mugLine(1)] })),
      );
      expect(urgent.totalMdl).toBe(goods1 + 50);
      expect(urgent.goodsTotalMdl).toBe(goods1);
      expect(await prisma.order.count({ where: { clientId: dealer.customerId, deletedAt: null } })).toBe(0);
    });

    it("urgent → isPrio, fee stored, price = goods + fee, audited and logged", async () => {
      const order = await createOk(dealer, { urgent: true });
      expect(order.isPrio).toBe(true);
      expect(num(order.urgencyFee)).toBe(50);
      expect(num(order.price)).toBe(goods1 + 50);
      expect(order.urgencyByDealerAt).toBeInstanceOf(Date);
      expect(order.urgencySetById).toBe(dealer.userId);
      const logs = await logsOf(order.id, "urgency_dealer_on");
      expect(logs).toHaveLength(1);
      expect(logs[0]!.metadata).toMatchObject({ feeMdl: 50, goodsTotalMdl: goods1 });
    });

    it("a fee / price sent by the client is ignored (server price only)", async () => {
      const order = await createOk(dealer, {
        urgent: true,
        urgencyFee: 1,
        urgencyFeeMdl: 0,
        feeMdl: 0,
        price: 1,
        isPrio: false,
      });
      expect(num(order.urgencyFee)).toBe(50);
      expect(num(order.price)).toBe(goods1 + 50);
      expect(order.isPrio).toBe(true);
    });

    it("not urgent → unchanged order (no fee, no marker)", async () => {
      const order = await createOk(dealer, {});
      expect(order.isPrio).toBe(false);
      expect(order.urgencyFee).toBeNull();
      expect(order.urgencyByDealerAt).toBeNull();
      expect(num(order.price)).toBe(goods1);
    });

    it("own amount 0 on the card = free urgency", async () => {
      const order = await createOk(ownFreeDealer, { urgent: true });
      expect(order.isPrio).toBe(true);
      expect(num(order.urgencyFee)).toBe(0);
      expect(num(order.price)).toBe(goods1);
    });

    it("«срочность недоступна» → 400, nothing created; a normal order still works", async () => {
      const before = await prisma.order.count({ where: { clientId: blockedDealer.customerId } });
      const { res, out } = await create(blockedDealer, { urgent: true });
      expect(res.status).toBe(400);
      expect(out.code).toBe("urgency_unavailable");
      expect(await prisma.order.count({ where: { clientId: blockedDealer.customerId } })).toBe(before);

      asCustomer(blockedDealer);
      const quote = await json(await createOrder(req("/api/cabinet/orders", "POST", { dryRun: true, lines: [mugLine(1)] })));
      expect(quote.urgency).toMatchObject({ available: false });

      const plain = await createOk(blockedDealer, {});
      expect(plain.isPrio).toBe(false);
    });

    it("non-dealer cabinet users cannot create via the dealer wizard at all (403)", async () => {
      const { res } = await create(retail, { urgent: true });
      expect(res.status).toBe(403);
    });
  });

  // ─── Edit ───────────────────────────────────────────────────────────────

  describe("cabinet edit («Изменить»)", () => {
    it("toggle on then off recalculates price and logs both", async () => {
      const order = await createOk(dealer, {});
      const on = await put(dealer, order, { urgent: true });
      expect(on.res.status, JSON.stringify(on.out)).toBe(200);
      expect(on.out).toMatchObject({ price: goods1 + 50, urgent: true, urgencyFeeMdl: 50 });
      let row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.isPrio).toBe(true);
      expect(num(row.price)).toBe(goods1 + 50);
      expect(num(row.urgencyFee)).toBe(50);

      const off = await put(dealer, order, { urgent: false });
      expect(off.res.status).toBe(200);
      row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.isPrio).toBe(false);
      expect(row.urgencyFee).toBeNull();
      expect(row.urgencyByDealerAt).toBeNull();
      expect(num(row.price)).toBe(goods1);
      expect(await logsOf(order.id, "urgency_dealer_on")).toHaveLength(1);
      const offLogs = await logsOf(order.id, "urgency_dealer_off");
      expect(offLogs).toHaveLength(1);
      expect(offLogs[0]!.metadata).toMatchObject({ feeMdl: 50 });
    });

    it("editing lines keeps the frozen fee; a later rate change does not touch it", async () => {
      const order = await createOk(dealer, { urgent: true });
      await setGlobalFee(80);
      try {
        // Untouched order: same price after the rate change.
        expect(num((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).price)).toBe(goods1 + 50);
        // Dry run quotes today's offer but the order's own fee.
        asCustomer(dealer);
        const dry = await json(
          await putOrder(req(`/api/cabinet/orders/${order.id}`, "PUT", editBody(order, { dryRun: true }, 2)), ctx(order.id)),
        );
        expect(dry.urgency).toMatchObject({ available: true, feeMdl: 80, state: "dealer", orderFeeMdl: 50 });
        expect(dry.totalMdl).toBe(goods1 * 2 + 50);
        // Edit (2 copies, urgency omitted = unchanged) → goods recomputed, fee still 50.
        const edited = await put(dealer, order, {}, 2);
        expect(edited.res.status, JSON.stringify(edited.out)).toBe(200);
        const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
        expect(num(row.price)).toBe(goods1 * 2 + 50);
        expect(num(row.urgencyFee)).toBe(50);
        expect(row.isPrio).toBe(true);
      } finally {
        await setGlobalFee(50);
      }
    });

    it("turning on in an edit takes the rate at that moment", async () => {
      const order = await createOk(dealer, {});
      await setGlobalFee(65);
      try {
        await put(dealer, order, { urgent: true });
        const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
        expect(num(row.urgencyFee)).toBe(65);
        expect(num(row.price)).toBe(goods1 + 65);
      } finally {
        await setGlobalFee(50);
      }
    });

    it("unavailable dealer cannot turn it on in an edit (400, order untouched)", async () => {
      const order = await createOk(blockedDealer, {});
      const { res, out } = await put(blockedDealer, order, { urgent: true });
      expect(res.status).toBe(400);
      expect(out.code).toBe("urgency_unavailable");
      const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.isPrio).toBe(false);
      expect(num(row.price)).toBe(goods1);
    });

    it("studio 🔥 stays: the dealer cannot remove it and is not charged", async () => {
      const order = await createOk(dealer, {});
      await prisma.order.update({ where: { id: order.id }, data: { isPrio: true } });
      const { res } = await put(dealer, order, { urgent: false });
      expect(res.status).toBe(200);
      let row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.isPrio).toBe(true);
      expect(row.urgencyFee).toBeNull();
      expect(num(row.price)).toBe(goods1);
      await put(dealer, order, { urgent: true });
      row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.urgencyByDealerAt).toBeNull();
      expect(num(row.price)).toBe(goods1);
    });

    it.each([
      ["paid", { isPaid: true }, "paid"],
      ["printing status", { status: "WORKSHOP_PRINTING" }, "printing"],
      ["shop", { source: "shop" }, "shop"],
    ])("%s order → 409, urgency not changed", async (_label, patch, reason) => {
      const order = await createOk(dealer, {});
      await prisma.order.update({ where: { id: order.id }, data: patch });
      const { res, out } = await put(dealer, order, { urgent: true });
      expect(res.status).toBe(409);
      expect(out.reason).toBe(reason);
      const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.isPrio).toBe(false);
      expect(row.urgencyFee).toBeNull();
    });

    it("a line already PRINTING → 409", async () => {
      const order = await createOk(dealer, { urgent: true });
      await prisma.orderLine.updateMany({ where: { orderId: order.id }, data: { productionStatus: "PRINTING" } });
      const { res, out } = await put(dealer, order, { urgent: false });
      expect(res.status).toBe(409);
      expect(out.reason).toBe("printing");
      const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.isPrio).toBe(true);
      expect(num(row.urgencyFee)).toBe(50);
    });

    it("race: staff marks a line PRINTING while the dealer toggles → refused, nothing written", async () => {
      const order = await createOk(dealer, {});
      const f = order.orderLines[0]!.files[0]!;
      await expect(
        dealerEditOrder({
          orderId: order.id,
          actor: { userId: dealer.userId, studioCustomerId: dealer.customerId },
          input: {
            urgent: true,
            lines: [{ orderLineId: order.orderLines[0]!.id, productType: "mug", mugProductId: mugId, files: [{ fileId: f.id }] }],
          },
          hooks: {
            beforeLock: async () => {
              await prisma.orderLine.updateMany({ where: { orderId: order.id }, data: { productionStatus: "PRINTING" } });
            },
          },
        }),
      ).rejects.toMatchObject({ code: "order_locked", block: "printing" } satisfies Partial<DealerOrderModifyError>);
      const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.isPrio).toBe(false);
      expect(row.urgencyFee).toBeNull();
      expect(num(row.price)).toBe(goods1);
      expect(await logsOf(order.id, "urgency_dealer_on")).toHaveLength(0);
    });
  });

  // ─── Staff ──────────────────────────────────────────────────────────────

  describe("staff", () => {
    it("waive: price and debt drop by the fee, order stays urgent, logged; second waive 409", async () => {
      const order = await createOk(dealer, { urgent: true });
      const debtBefore = await debtOf(dealer.customerId);
      asStaff(admin);
      const res = await waiveFee(req(`/api/orders/${order.id}/urgency-fee`, "DELETE"), ctx(order.id));
      const out = await json(res);
      expect(res.status, JSON.stringify(out)).toBe(200);
      expect(out).toMatchObject({ price: goods1, waivedFeeMdl: 50 });
      const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(num(row.price)).toBe(goods1);
      expect(num(row.urgencyFee)).toBe(0);
      expect(row.isPrio).toBe(true);
      expect(row.urgencyByDealerAt).not.toBeNull();
      expect(row.urgencyFeeWaivedById).toBe(admin.id);
      expect(await debtOf(dealer.customerId)).toBe(Math.round((debtBefore - 50) * 100) / 100);
      const logs = await logsOf(order.id, "urgency_fee_waived");
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({ userId: admin.id, oldValue: String(goods1 + 50), newValue: String(goods1) });

      const again = await waiveFee(req(`/api/orders/${order.id}/urgency-fee`, "DELETE"), ctx(order.id));
      expect(again.status).toBe(409);
    });

    it("waive refused on a paid order, on a free one and unauthenticated", async () => {
      const paid = await createOk(dealer, { urgent: true });
      await prisma.order.update({ where: { id: paid.id }, data: { isPaid: true } });
      asStaff(admin);
      expect((await waiveFee(req("/x", "DELETE"), ctx(paid.id))).status).toBe(409);
      expect(num((await prisma.order.findUniqueOrThrow({ where: { id: paid.id } })).price)).toBe(goods1 + 50);

      const free = await createOk(ownFreeDealer, { urgent: true });
      asStaff(admin);
      expect((await waiveFee(req("/x", "DELETE"), ctx(free.id))).status).toBe(409);

      asStaff(null);
      expect((await waiveFee(req("/x", "DELETE"), ctx(paid.id))).status).toBe(401);
      asCustomer(dealer);
      expect((await waiveFee(req("/x", "DELETE"), ctx(paid.id))).status).toBe(401);
    });

    it("staff 🔥 on a retail order stays free and unchanged", async () => {
      const order = await prisma.order.create({
        data: {
          phone: "+37360000000",
          clientId: retail.customerId,
          price: 100,
          publicToken: `it-urg-${stamp}-retail`,
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      });
      asStaff(admin);
      const res = await patchOrder(req(`/api/orders/${order.id}`, "PATCH", { isPrio: true }), ctx(order.id));
      expect(res.status).toBe(200);
      let row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.isPrio).toBe(true);
      expect(num(row.price)).toBe(100);
      expect(row.urgencyFee).toBeNull();
      expect(row.urgencyByDealerAt).toBeNull();
      await patchOrder(req(`/api/orders/${order.id}`, "PATCH", { isPrio: false }), ctx(order.id));
      row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.isPrio).toBe(false);
      expect(num(row.price)).toBe(100);
    });

    it("staff 🔥 on a dealer order (not urgent) stays free", async () => {
      const order = await createOk(dealer, {});
      asStaff(admin);
      await patchOrder(req(`/api/orders/${order.id}`, "PATCH", { isPrio: true }), ctx(order.id));
      const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.isPrio).toBe(true);
      expect(num(row.price)).toBe(goods1);
      expect(row.urgencyByDealerAt).toBeNull();
    });

    it("staff takes 🔥 off a dealer-urgent order → the fee goes too (logged)", async () => {
      const order = await createOk(dealer, { urgent: true });
      asStaff(admin);
      const res = await patchOrder(req(`/api/orders/${order.id}`, "PATCH", { isPrio: false }), ctx(order.id));
      expect(res.status).toBe(200);
      const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.isPrio).toBe(false);
      expect(row.urgencyFee).toBeNull();
      expect(row.urgencyByDealerAt).toBeNull();
      expect(num(row.price)).toBe(goods1);
      expect(await logsOf(order.id, "urgency_staff_off")).toHaveLength(1);
    });

    it("finished order: delivered → 🔥 on → 🔥 off keeps the fee and the price", async () => {
      const order = await createOk(dealer, { urgent: true });
      asStaff(admin);
      await patchOrder(req("/x", "PATCH", { status: "DELIVERED" }), ctx(order.id));
      await patchOrder(req("/x", "PATCH", { isPrio: true }), ctx(order.id));
      let row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.isPrio).toBe(true);
      await patchOrder(req("/x", "PATCH", { isPrio: false }), ctx(order.id));
      row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.isPrio).toBe(false);
      expect(num(row.urgencyFee)).toBe(50);
      expect(row.urgencyByDealerAt).not.toBeNull();
      expect(num(row.price)).toBe(goods1 + 50);
      expect(await logsOf(order.id, "urgency_staff_off")).toHaveLength(0);

      // Cabinet: no «Срочно» badge any more, but the fee stays under the price.
      asCustomer(dealer);
      const detail = await json(await getOrder(req("/x", "GET"), ctx(order.id)));
      expect(detail.urgency).toEqual({ urgent: false, state: "dealer", feeMdl: 50 });
      const list = await json(await listOrders(req(`/api/cabinet/orders?search=${order.orderNumber}`, "GET")));
      expect((list.orders as Record<string, unknown>[]).find((o) => o.id === order.id)!.urgencyFeeMdl).toBe(50);
    });

    it("made (WORKSHOP_READY) order: 🔥 off keeps the fee", async () => {
      const order = await createOk(dealer, { urgent: true });
      await prisma.order.update({ where: { id: order.id }, data: { status: "WORKSHOP_READY" } });
      asStaff(admin);
      await patchOrder(req("/x", "PATCH", { isPrio: false }), ctx(order.id));
      const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.isPrio).toBe(false);
      expect(num(row.urgencyFee)).toBe(50);
      expect(num(row.price)).toBe(goods1 + 50);
    });

    it("price contract: studio-priced order (null) → staff types 100 → stored 130; edit prefill 100; waive → 100", async () => {
      const order = await createOk(dealer, { urgent: true });
      // Studio-priced: no automatic price, fee 30 frozen on the order.
      await prisma.order.update({ where: { id: order.id }, data: { price: null, urgencyFee: 30 } });
      asStaff(admin);
      let res: Response = await patchOrder(req("/x", "PATCH", { price: 100 }), ctx(order.id));
      expect(res.status).toBe(200);
      let row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(num(row.price)).toBe(130);
      const priceLog = await prisma.orderLog.findMany({ where: { orderId: order.id, action: "field_updated", field: "price" } });
      expect(priceLog.at(-1)).toMatchObject({ oldValue: null, newValue: "130" });

      // Edit fields get the goods price: wizard GET and the client card list.
      const detail = await json(await getAdminOrder(req("/x", "GET"), ctx(order.id)));
      expect(detail).toMatchObject({ price: 130, dealerUrgencyFeeMdl: 30 });
      expect(detail).not.toHaveProperty("urgencyFee");
      const card = await json(await clientOrders(req("/x", "GET"), ctx(dealer.customerId)));
      const cardRow = (card.orders as Record<string, unknown>[]).find((o) => o.id === order.id)!;
      expect(cardRow).toMatchObject({ price: 130, urgencyFeeMdl: 30 });
      expect((cardRow.price as number) - (cardRow.urgencyFeeMdl as number)).toBe(100);

      // Re-saving the prefilled goods price never adds the fee twice (and logs nothing).
      const logsBefore = await prisma.orderLog.count({ where: { orderId: order.id } });
      res = await patchOrder(req("/x", "PATCH", { price: 100 }), ctx(order.id));
      expect(res.status).toBe(200);
      row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(num(row.price)).toBe(130);
      expect(await prisma.orderLog.count({ where: { orderId: order.id } })).toBe(logsBefore);

      // Staff wizard save with the prefilled 100 + the same lines → still 130.
      const f = order.orderLines[0]!.files[0]!;
      res = await patchAdminOrder(
        req("/x", "PATCH", {
          phone: row.phone,
          clientId: dealer.customerId,
          price: 100,
          lines: [{ orderLineId: order.orderLines[0]!.id, productType: "mug", mugProductId: mugId, files: [{ fileId: f.id }] }],
        }),
        ctx(order.id),
      );
      expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);
      row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(num(row.price)).toBe(130);
      expect(num(row.urgencyFee)).toBe(30);

      // Waive takes exactly the fee off.
      res = await waiveFee(req("/x", "DELETE"), ctx(order.id));
      expect(res.status).toBe(200);
      row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(num(row.price)).toBe(100);
      expect(num(row.urgencyFee)).toBe(0);
      // After the waive the staff price is the whole price again.
      await patchOrder(req("/x", "PATCH", { price: 110 }), ctx(order.id));
      expect(num((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).price)).toBe(110);
    });

    it("price typed in the same save as 🔥 off: fee removed, price = typed", async () => {
      const order = await createOk(dealer, { urgent: true });
      asStaff(admin);
      const res = await patchOrder(req("/x", "PATCH", { isPrio: false, price: 90 }), ctx(order.id));
      expect(res.status).toBe(200);
      const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.isPrio).toBe(false);
      expect(row.urgencyFee).toBeNull();
      expect(num(row.price)).toBe(90);
    });

    it("price on an order without a dealer fee (staff 🔥 / free) is stored as typed", async () => {
      const free = await createOk(ownFreeDealer, { urgent: true });
      asStaff(admin);
      await patchOrder(req("/x", "PATCH", { price: 77 }), ctx(free.id));
      expect(num((await prisma.order.findUniqueOrThrow({ where: { id: free.id } })).price)).toBe(77);
    });

    it("workshop role may waive too", async () => {
      const order = await createOk(dealer, { urgent: true });
      asStaff(workshop);
      const res = await waiveFee(req("/x", "DELETE"), ctx(order.id));
      expect(res.status).toBe(200);
      expect(num((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).price)).toBe(goods1);
    });

    it("«Выдан» resets 🔥 but keeps the dealer's fee in the price", async () => {
      const order = await createOk(dealer, { urgent: true });
      asStaff(admin);
      const res = await patchOrder(req(`/api/orders/${order.id}`, "PATCH", { status: "DELIVERED" }), ctx(order.id));
      expect(res.status).toBe(200);
      const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.isPrio).toBe(false);
      expect(num(row.urgencyFee)).toBe(50);
      expect(num(row.price)).toBe(goods1 + 50);
    });

    it("workshop board + admin list carry the dealer-request marker", async () => {
      const order = await createOk(dealer, { urgent: true });
      const phone = (await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).phone;
      const board = await fetchWorkshopBoardData({ id: admin.id, name: "a", role: "admin" }, { search: phone });
      const mine = findByOrderId(board, order.id);
      expect(mine.length).toBeGreaterThan(0);
      for (const l of mine) expect(l.dealerUrgency).toEqual({ feeMdl: 50, waived: false });

      const list = await fetchOrdersData({ id: admin.id, name: "a", role: "admin" }, { search: String(order.orderNumber) });
      const row = (list.orders as Record<string, unknown>[]).find((o) => o.id === order.id);
      expect(row?.dealerUrgency).toEqual({ feeMdl: 50, waived: false });
      expect(row).not.toHaveProperty("urgencyFee");
    });
  });

  // ─── Money views ────────────────────────────────────────────────────────

  describe("debt, cabinet views and invoices", () => {
    it("debt includes the fee; turning urgency off removes it from the debt", async () => {
      const before = await debtOf(dealer.customerId);
      const order = await createOk(dealer, { urgent: true });
      expect(await debtOf(dealer.customerId)).toBe(Math.round((before + goods1 + 50) * 100) / 100);
      await put(dealer, order, { urgent: false });
      expect(await debtOf(dealer.customerId)).toBe(Math.round((before + goods1) * 100) / 100);
    });

    it("cabinet detail + list show the fee; no costs leak", async () => {
      const order = await createOk(dealer, { urgent: true });
      asCustomer(dealer);
      const detail = await json(await getOrder(req(`/api/cabinet/orders/${order.id}`, "GET"), ctx(order.id)));
      expect(detail.urgency).toEqual({ urgent: true, state: "dealer", feeMdl: 50 });
      expect(detail.price).toBe(goods1 + 50);
      expect(detail).not.toHaveProperty("urgencyFee");
      expect(detail).not.toHaveProperty("urgencySetById");
      const list = await json(await listOrders(req(`/api/cabinet/orders?search=${order.orderNumber}`, "GET")));
      const row = (list.orders as Record<string, unknown>[]).find((o) => o.id === order.id)!;
      expect(row.urgencyFeeMdl).toBe(50);
      expect(row).not.toHaveProperty("urgencyByDealerAt");
    });

    it("invoice picker: the fee is billed as its own «Срочность» line", async () => {
      const order = await createOk(dealer, { urgent: true });
      asStaff(admin);
      const out = await json(await ordersByClient(req(`/api/admin/orders/by-client?clientId=${dealer.customerId}`, "GET")));
      const picked = (out.orders as Record<string, unknown>[]).find((o) => o.id === order.id)!;
      expect(picked.urgencyFeeMdl).toBe(50);
      const lines = orderToInvoiceLines(
        { id: order.id, orderNumber: order.orderNumber, productLabel: "Mug", price: picked.price as number, urgencyFeeMdl: 50 },
        { orderLine: (n) => `#${n}`, urgencyLine: (n) => `Срочность #${n}` },
      );
      expect(lines.map((l) => l.unitPrice)).toEqual([goods1, 50]);
      const plain = await createOk(dealer, {});
      asStaff(admin);
      const out2 = await json(await ordersByClient(req(`/api/admin/orders/by-client?clientId=${dealer.customerId}`, "GET")));
      expect((out2.orders as Record<string, unknown>[]).find((o) => o.id === plain.id)!.urgencyFeeMdl).toBeNull();
    });
  });

  // ─── Settings + client card ─────────────────────────────────────────────

  describe("settings and client card", () => {
    it("superadmin sets the global fee in Settings", async () => {
      asStaff(superadmin);
      const res = await patchCompanyProfile(req("/api/admin/company-profile", "PATCH", { dealerUrgencyFeeMdl: 42.5 }));
      const out = await json(res);
      expect(res.status, JSON.stringify(out)).toBe(200);
      expect((out.profile as Record<string, unknown>).dealerUrgencyFeeMdl).toBe("42.5");
      const bad = await patchCompanyProfile(req("/api/admin/company-profile", "PATCH", { dealerUrgencyFeeMdl: -1 }));
      expect(bad.status).toBe(400);
      asStaff(admin);
      expect((await patchCompanyProfile(req("/x", "PATCH", { dealerUrgencyFeeMdl: 1 }))).status).toBe(403);
      await setGlobalFee(50);
    });

    it("client card override: custom / default / unavailable, superadmin only", async () => {
      const party = await makeCustomer(true);
      try {
        asStaff(admin);
        expect(
          (await putClientUrgency(req("/x", "PUT", { mode: "custom", amountMdl: 30 }), ctx(party.customerId))).status,
        ).toBe(403);

        asStaff(superadmin);
        const r1 = await putClientUrgency(req("/x", "PUT", { mode: "custom", amountMdl: 30 }), ctx(party.customerId));
        expect(await json(r1)).toEqual({ mode: "custom", amountMdl: 30, globalFeeMdl: 50 });
        expect((await putClientUrgency(req("/x", "PUT", { mode: "custom" }), ctx(party.customerId))).status).toBe(400);
        const card = await json(await getClient(req("/x", "GET"), ctx(party.customerId)));
        expect(card.dealerUrgency).toEqual({ mode: "custom", amountMdl: 30, globalFeeMdl: 50 });

        const own = await createOk(party, { urgent: true });
        expect(num(own.urgencyFee)).toBe(30);

        asStaff(superadmin);
        await putClientUrgency(req("/x", "PUT", { mode: "unavailable" }), ctx(party.customerId));
        expect((await create(party, { urgent: true })).res.status).toBe(400);
        // The earlier order keeps its fee.
        expect(num((await prisma.order.findUniqueOrThrow({ where: { id: own.id } })).urgencyFee)).toBe(30);

        asStaff(superadmin);
        await putClientUrgency(req("/x", "PUT", { mode: "default" }), ctx(party.customerId));
        const dflt = await createOk(party, { urgent: true });
        expect(num(dflt.urgencyFee)).toBe(50);
      } finally {
        await prisma.order.deleteMany({ where: { clientId: party.customerId } });
        await prisma.user.deleteMany({ where: { id: party.userId } });
        await prisma.studioCustomer.deleteMany({ where: { id: party.customerId } });
      }
    });
  });
});
