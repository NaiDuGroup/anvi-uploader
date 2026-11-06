/**
 * Per-line production status, step 3: «Нужен макет» on one order line.
 *
 * - staff flag / clear (`/api/orders/[id]/lines/[lineId]/layout-issue`);
 * - the owner replaces the file from the cabinet
 *   (`/api/cabinet/orders/[id]/lines/[lineId]/replace-file`) while other lines print;
 * - staff replacement through the admin edit returns the line to WAITING;
 * - races between the staff clear and the owner's replacement;
 * - mug batch selection skips the flagged line; dealer lock by line status.
 *
 * Route handlers run in-process with real sessions against a LOCAL database
 * (refuses any other DATABASE_URL). Run with
 * `npx vitest run --config vitest.integration.config.ts tests/integration/line-layout-issue.test.ts`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const cookieJar = vi.hoisted(() => ({ customer: null as string | null, admin: null as string | null }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value =
        name === "customer_session" ? cookieJar.customer : name === "admin_session" ? cookieJar.admin : null;
      return value ? { name, value } : undefined;
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

import { prisma } from "@/lib/prisma";
import { createSession, hashPassword } from "@/lib/auth";
import { POST as createAdminOrder } from "@/app/api/admin/orders/route";
import { PATCH as patchAdminOrder } from "@/app/api/admin/orders/[id]/route";
import { PATCH as patchOrder } from "@/app/api/orders/[id]/route";
import { PATCH as patchMugLayout } from "@/app/api/admin/orders/[id]/mug-layout/route";
import { PATCH as patchLineStatus } from "@/app/api/orders/[id]/lines/status/route";
import { DELETE as clearRoute, POST as flagRoute } from "@/app/api/orders/[id]/lines/[lineId]/layout-issue/route";
import { POST as replaceRoute } from "@/app/api/cabinet/orders/[id]/lines/[lineId]/replace-file/route";
import { GET as listCabinetOrders, POST as createCabinetOrder } from "@/app/api/cabinet/orders/route";
import { GET as getCabinetOrder, PUT as putCabinetOrder } from "@/app/api/cabinet/orders/[id]/route";
import { POST as cancelCabinetOrder } from "@/app/api/cabinet/orders/[id]/cancel/route";
import { GET as cabinetUnread } from "@/app/api/cabinet/unread/route";
import { clearLineLayoutIssue, LayoutIssueError, ownerReplaceLayoutFile } from "@/lib/orderLineLayoutIssue";
import { deriveWorkshopOrderStatus } from "@/lib/orderStatusFromLines";
import { checkLineStatusSync } from "@/lib/orderLineStatusCheck";
import { fetchWorkshopBoardData } from "@/lib/fetchWorkshopBoardData";
import {
  filterMugTilesReadyForBatch,
  flattenMugSectionTiles,
  mugLineStatusSnapshot,
} from "@/lib/workshopBoard/mugBatchFromSection";
import type { OrderStatus } from "@/lib/validations";
import { cleanupTestMugs, createTestMug, mugStock } from "./mugSeed";
import { cleanupTestNotebook, createTestNotebook, notebookStock } from "./notebookSeed";
import { cleanupTestLfMaterial, createTestLfMaterial, type TestLfMaterial } from "./lfMaterialSeed";

const layout = {
  templateId: "text_photo" as const,
  text: "",
  fontFamily: "Roboto",
  textColor: "#000000",
  backgroundColor: "transparent",
  photoUrls: [] as string[],
  photoSettings: [] as Array<{ fitMode: "cover" | "contain"; alignment: "left" | "center" | "right" }>,
};

function req(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
  });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const lineCtx = (id: string, lineId: string) => ({ params: Promise.resolve({ id, lineId }) });

const stamp = `${Date.now()}`.slice(-7);
let keySeq = 0;
/** A valid order upload key (`isOrderUploadKey`). */
function uploadKey(name: string): string {
  keySeq += 1;
  return `uploads/${Date.now()}-${String(keySeq).padStart(8, "0")}-${name}`;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Party = { customerId: string; userId: string; token: string };

describe.skipIf(!isLocalDb)("integration: «Нужен макет» on an order line (step 3)", () => {
  let mugId: string;
  let notebookId: string;
  let lf: TestLfMaterial;
  let dealer: Party;
  let retail: Party;
  let stranger: Party;
  const staff: Record<"admin" | "workshop" | "viewer", { id: string; token: string }> = {} as never;
  const phone = `+3737${stamp}1`;
  const createdIds: string[] = [];

  async function makeCustomer(isDealer: boolean, n: number): Promise<Party> {
    const customer = await prisma.studioCustomer.create({
      data: { kind: "INDIVIDUAL", phone: `+3737${stamp}${n + 2}`, personName: `IT layout ${stamp}-${n}`, isDealer },
    });
    const user = await prisma.user.create({
      data: {
        name: `it-layout-c${n}-${stamp}@anvi.test`,
        role: "customer",
        password: hashPassword("x"),
        studioCustomerId: customer.id,
      },
    });
    return { customerId: customer.id, userId: user.id, token: await createSession(user.id) };
  }

  beforeAll(async () => {
    mugId = (await createTestMug(200, { sellPrice: 100, skuPrefix: "IT-LLI" })).id;
    notebookId = (await createTestNotebook(200, "IT-LLI-NB")).id;
    lf = await createTestLfMaterial(`IT LLI BANNER ${stamp}`, { stockLm: 100 });
    dealer = await makeCustomer(true, 1);
    retail = await makeCustomer(false, 2);
    stranger = await makeCustomer(true, 3);
    for (const role of ["admin", "workshop", "viewer"] as const) {
      const u = await prisma.user.create({
        data: { name: `it-lli-${role}-${stamp}@anvi.test`, role, password: hashPassword("x") },
      });
      staff[role] = { id: u.id, token: await createSession(u.id) };
    }
  });

  afterAll(async () => {
    const clientIds = [dealer, retail, stranger].filter(Boolean).map((p) => p.customerId);
    await prisma.order.deleteMany({
      where: { OR: [{ clientId: { in: clientIds } }, { phone }, { id: { in: createdIds } }] },
    });
    await cleanupTestMugs([mugId]);
    await cleanupTestNotebook(notebookId);
    await cleanupTestLfMaterial(lf);
    await prisma.user.deleteMany({
      where: { id: { in: [...Object.values(staff).map((u) => u.id), dealer.userId, retail.userId, stranger.userId] } },
    });
    await prisma.studioCustomer.deleteMany({ where: { id: { in: clientIds } } });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    cookieJar.customer = null;
    cookieJar.admin = null;
  });

  // ─── Helpers ─────────────────────────────────────────────────────────────

  interface MixedOrder {
    id: string;
    orderNumber: number;
    mug: string;
    mug2: string;
    notebook: string;
    banner: string;
  }

  /** mug (.1/4) + mug (.2/4) + notebook (.3/4) + banner (.4/4), SENT_TO_WORKSHOP; optionally owned by a cabinet client. */
  async function mixedOrder(owner?: Party): Promise<MixedOrder> {
    cookieJar.admin = staff.admin.token;
    const n = createdIds.length;
    const res = await createAdminOrder(
      req("/api/admin/orders", "POST", {
        phone,
        lines: [
          { productType: "mug", mugProductId: mugId, mugLayoutData: layout, files: [{ fileName: "mug-a.png", fileUrl: `uploads/it-lli/mug-a-${n}.png`, copies: 1, color: "color" }] },
          { productType: "mug", mugProductId: mugId, mugLayoutData: layout, files: [{ fileName: "mug-b.png", fileUrl: `uploads/it-lli/mug-b-${n}.png`, copies: 2, color: "color" }] },
          { productType: "notebook", notebookProductId: notebookId, notebookLayoutData: layout, files: [{ fileName: "nb.png", fileUrl: `uploads/it-lli/nb-${n}.png`, copies: 1, color: "color" }] },
          {
            productType: "large_format_print",
            largeFormatMaterialId: lf.id,
            printWidthCm: 50,
            printHeightCm: 70,
            quantity: 1,
            customerType: "retail",
            files: [{ fileName: "banner.pdf", fileUrl: `uploads/it-lli/banner-${n}.pdf`, copies: 1, color: "color" }],
          },
        ],
      }),
    );
    const body = (await res.json()) as { id: string; orderNumber: number; status: string };
    expect(res.status, JSON.stringify(body)).toBe(201);
    expect(body.status).toBe("SENT_TO_WORKSHOP");
    cookieJar.admin = null;
    createdIds.push(body.id);
    if (owner) await prisma.order.update({ where: { id: body.id }, data: { clientId: owner.customerId } });
    const ls = await lines(body.id);
    expect(ls.map((l) => l.productType)).toEqual(["mug", "mug", "notebook", "large_format_print"]);
    return { id: body.id, orderNumber: body.orderNumber, mug: ls[0]!.id, mug2: ls[1]!.id, notebook: ls[2]!.id, banner: ls[3]!.id };
  }

  const code = (o: { orderNumber: number }, i: number, total = 4) => `#${String(o.orderNumber).padStart(4, "0")}.${i}/${total}`;

  async function lines(orderId: string) {
    return prisma.orderLine.findMany({
      where: { orderId },
      orderBy: { sortOrder: "asc" },
      include: { files: { orderBy: { fileName: "asc" } } },
    });
  }
  async function line(lineId: string) {
    return prisma.orderLine.findUniqueOrThrow({ where: { id: lineId }, include: { files: true } });
  }
  async function orderRow(orderId: string) {
    return prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  }
  async function logs(orderId: string, action?: string) {
    return prisma.orderLog.findMany({ where: { orderId, ...(action ? { action } : {}) }, orderBy: { createdAt: "asc" } });
  }

  type Res = { status: number; body: Record<string, unknown> };
  async function read(res: Response): Promise<Res> {
    const text = await res.text();
    return { status: res.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : {} };
  }

  async function flag(orderId: string, lineId: string, body: unknown, as: keyof typeof staff | null = "workshop"): Promise<Res> {
    cookieJar.admin = as ? staff[as].token : null;
    const r = await read(await flagRoute(req(`/x`, "POST", body), lineCtx(orderId, lineId)));
    cookieJar.admin = null;
    return r;
  }
  async function clear(orderId: string, lineId: string, as: keyof typeof staff | null = "workshop"): Promise<Res> {
    cookieJar.admin = as ? staff[as].token : null;
    const r = await read(await clearRoute(req(`/x`, "DELETE"), lineCtx(orderId, lineId)));
    cookieJar.admin = null;
    return r;
  }
  async function replace(orderId: string, lineId: string, body: unknown, as: Party | null): Promise<Res> {
    cookieJar.customer = as?.token ?? null;
    const r = await read(await replaceRoute(req(`/x`, "POST", body), lineCtx(orderId, lineId)));
    cookieJar.customer = null;
    return r;
  }
  async function setLines(orderId: string, lineIds: string[], status: string): Promise<Res> {
    cookieJar.admin = staff.workshop.token;
    const r = await read(await patchLineStatus(req(`/x`, "PATCH", { lineIds, status }), ctx(orderId)));
    cookieJar.admin = null;
    return r;
  }
  async function setOrderStatus(orderId: string, status: OrderStatus, extra: Record<string, unknown> = {}) {
    cookieJar.admin = staff.admin.token;
    const r = await read(await patchOrder(req(`/x`, "PATCH", { status, ...extra }), ctx(orderId)));
    cookieJar.admin = null;
    expect(r.status, JSON.stringify(r.body)).toBe(200);
  }
  async function cancel(orderId: string, as: Party): Promise<Res> {
    cookieJar.customer = as.token;
    const r = await read(await cancelCabinetOrder(req(`/x`, "POST", { reason: "передумал" }), ctx(orderId)));
    cookieJar.customer = null;
    return r;
  }
  async function cabinetDetail(orderId: string, as: Party): Promise<Res> {
    cookieJar.customer = as.token;
    const r = await read(await getCabinetOrder(req(`/x`, "GET"), ctx(orderId)));
    cookieJar.customer = null;
    return r;
  }
  async function cabinetList(as: Party, query = ""): Promise<Res> {
    cookieJar.customer = as.token;
    const r = await read(await listCabinetOrders(req(`/api/cabinet/orders${query}`, "GET")));
    cookieJar.customer = null;
    return r;
  }
  async function unread(as: Party): Promise<Res> {
    cookieJar.customer = as.token;
    const r = await read(await cabinetUnread());
    cookieJar.customer = null;
    return r;
  }

  /** Order status, every line status, derivation consistent, invariant check clean. */
  async function expectState(orderId: string, orderStatus: string, lineStatuses: string[]) {
    const o = await orderRow(orderId);
    const ls = await lines(orderId);
    expect(o.status).toBe(orderStatus);
    expect(ls.map((l) => l.productionStatus)).toEqual(lineStatuses);
    if (["SENT_TO_WORKSHOP", "WORKSHOP_PRINTING", "WORKSHOP_READY"].includes(o.status)) {
      expect(deriveWorkshopOrderStatus(ls)).toBe(o.status);
    }
    expect((await checkLineStatusSync(prisma, { orderIds: [orderId] })).mismatches).toEqual([]);
  }

  async function expectNoIssueFields(lineId: string) {
    expect(await line(lineId)).toMatchObject({
      layoutIssueReason: null,
      layoutIssueNote: null,
      layoutIssueAt: null,
      layoutIssueById: null,
    });
  }

  /** Net stock movements of the order (count + sum per variant) — must not move on a file replacement. */
  async function stockSnapshot(orderId: string) {
    const rows = await prisma.stockMovement.findMany({
      where: { orderId },
      select: { variantId: true, delta: true, kind: true },
      orderBy: { createdAt: "asc" },
    });
    return {
      count: rows.length,
      net: rows.reduce<Record<string, number>>((m, r) => {
        m[r.variantId] = Math.round(((m[r.variantId] ?? 0) + Number(r.delta)) * 1e6) / 1e6;
        return m;
      }, {}),
      mug: await mugStock(mugId),
      notebook: await notebookStock(notebookId),
    };
  }

  // ─── Flag / clear: auth and validation ──────────────────────────────────

  describe("staff flag / clear", () => {
    it("auth: anonymous 401, a cabinet session 401, a non-staff role 403; nothing written", async () => {
      const o = await mixedOrder(dealer);
      expect((await flag(o.id, o.mug, { reason: "lowQuality" }, null)).status).toBe(401);
      expect((await clear(o.id, o.mug, null)).status).toBe(401);
      cookieJar.customer = dealer.token;
      expect((await flagRoute(req(`/x`, "POST", { reason: "lowQuality" }), lineCtx(o.id, o.mug))).status).toBe(401);
      expect((await clearRoute(req(`/x`, "DELETE"), lineCtx(o.id, o.mug))).status).toBe(401);
      cookieJar.customer = null;
      expect((await flag(o.id, o.mug, { reason: "lowQuality" }, "viewer")).status).toBe(403);
      expect((await clear(o.id, o.mug, "viewer")).status).toBe(403);
      await expectState(o.id, "SENT_TO_WORKSHOP", ["WAITING", "WAITING", "WAITING", "WAITING"]);
      expect(await logs(o.id, "line_layout_flagged")).toEqual([]);
    });

    it("validation: reason required / unknown, note > 500, bad JSON → 400; note of exactly 500 ok", async () => {
      const o = await mixedOrder();
      for (const body of [{}, { reason: "" }, { reason: "issue" }, { reason: null }, { reason: "lowQuality", note: "x".repeat(501) }, { reason: "lowQuality", note: 5 }]) {
        const r = await flag(o.id, o.mug, body);
        expect(r, JSON.stringify(body)).toMatchObject({ status: 400, body: { error: "Validation failed" } });
      }
      cookieJar.admin = staff.workshop.token;
      expect((await flagRoute(req(`/x`, "POST", "{nope"), lineCtx(o.id, o.mug))).status).toBe(400);
      cookieJar.admin = null;
      await expectState(o.id, "SENT_TO_WORKSHOP", ["WAITING", "WAITING", "WAITING", "WAITING"]);
      const ok = await flag(o.id, o.mug, { reason: "other", note: "y".repeat(500) });
      expect(ok.status, JSON.stringify(ok.body)).toBe(200);
      expect((await line(o.mug)).layoutIssueNote).toHaveLength(500);
    });

    it("unknown order / foreign line → 404", async () => {
      const a = await mixedOrder();
      const b = await mixedOrder();
      expect(await flag("00000000-0000-0000-0000-000000000000", a.mug, { reason: "lowQuality" })).toMatchObject({ status: 404, body: { error: "order_not_found" } });
      expect(await flag(a.id, b.mug, { reason: "lowQuality" })).toMatchObject({ status: 404, body: { error: "line_not_in_order" } });
      expect(await clear(a.id, b.mug)).toMatchObject({ status: 404, body: { error: "line_not_in_order" } });
      await expectState(b.id, "SENT_TO_WORKSHOP", ["WAITING", "WAITING", "WAITING", "WAITING"]);
    });

    it("outside the workshop phase → 409 wrong_phase (studio, ISSUE, finished)", async () => {
      const o = await mixedOrder();
      for (const status of ["IN_PROGRESS", "NEW", "READY_IN_STUDIO", "RETURNED_TO_STUDIO", "DELIVERED"] as const) {
        await setOrderStatus(o.id, status);
        expect(await flag(o.id, o.mug, { reason: "lowQuality" }), status).toMatchObject({ status: 409, body: { error: "wrong_phase" } });
      }
      await setOrderStatus(o.id, "SENT_TO_WORKSHOP");
      await setOrderStatus(o.id, "ISSUE", { issueReason: "нет плёнки" });
      expect(await flag(o.id, o.mug, { reason: "lowQuality" })).toMatchObject({ status: 409, body: { error: "wrong_phase" } });
      expect((await line(o.mug)).productionStatus).toBe("WAITING");
    });

    it("a DONE line or an already flagged line → 409 line_not_flaggable; a PRINTING line can be flagged", async () => {
      const o = await mixedOrder();
      await setLines(o.id, [o.banner], "DONE");
      expect(await flag(o.id, o.banner, { reason: "lowQuality" })).toMatchObject({ status: 409, body: { error: "line_not_flaggable" } });
      await setLines(o.id, [o.notebook], "PRINTING");
      const r = await flag(o.id, o.notebook, { reason: "missingPages" });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body).toMatchObject({ lineStatus: "NEEDS_LAYOUT", oldOrderStatus: "WORKSHOP_PRINTING", newOrderStatus: "WORKSHOP_PRINTING", lineCode: code(o, 3) });
      expect(await flag(o.id, o.notebook, { reason: "lowQuality" })).toMatchObject({ status: 409, body: { error: "line_not_flaggable" } });
      await expectState(o.id, "WORKSHOP_PRINTING", ["WAITING", "WAITING", "NEEDS_LAYOUT", "DONE"]);
    });

    it("flag: line NEEDS_LAYOUT with reason / trimmed note / when / who, logs with the line code, order status re-derived", async () => {
      const o = await mixedOrder(dealer);
      const before = (await logs(o.id)).length;
      const t0 = Date.now();
      const r = await flag(o.id, o.mug2, { reason: "wrongSize", note: "  нужно 9×9 см  " });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body).toEqual({
        orderId: o.id,
        orderNumber: o.orderNumber,
        lineId: o.mug2,
        lineCode: code(o, 2),
        lineStatus: "NEEDS_LAYOUT",
        oldOrderStatus: "SENT_TO_WORKSHOP",
        newOrderStatus: "SENT_TO_WORKSHOP",
      });
      const l = await line(o.mug2);
      expect(l).toMatchObject({
        productionStatus: "NEEDS_LAYOUT",
        layoutIssueReason: "wrongSize",
        layoutIssueNote: "нужно 9×9 см",
        layoutIssueById: staff.workshop.id,
        layoutFixedAt: null,
        layoutFixedById: null,
      });
      expect(l.layoutIssueAt!.getTime()).toBeGreaterThanOrEqual(t0 - 1000);
      expect(l.productionStatusAt!.getTime()).toBe(l.layoutIssueAt!.getTime());
      // NEEDS_LAYOUT ≡ WAITING: the order stays SENT_TO_WORKSHOP.
      await expectState(o.id, "SENT_TO_WORKSHOP", ["WAITING", "NEEDS_LAYOUT", "WAITING", "WAITING"]);

      const added = (await logs(o.id)).slice(before);
      expect(added.map((x) => [x.action, x.field, x.oldValue, x.newValue, x.userId])).toEqual(
        expect.arrayContaining([
          ["line_status_changed", "productionStatus", "WAITING", "NEEDS_LAYOUT", staff.workshop.id],
          ["line_layout_flagged", "layoutIssueReason", null, "wrongSize", staff.workshop.id],
        ]),
      );
      expect(added).toHaveLength(2); // no status_changed: the order status did not change
      expect(added.find((x) => x.action === "line_layout_flagged")!.metadata).toEqual({
        orderLineId: o.mug2,
        lineCode: code(o, 2),
        reason: "wrongSize",
        note: "нужно 9×9 см",
      });
      expect(added.find((x) => x.action === "line_status_changed")!.metadata).toEqual({ orderLineId: o.mug2, lineCode: code(o, 2) });
    });

    it("flag in a printing order: the only printing line flagged → order back to SENT_TO_WORKSHOP (derived log)", async () => {
      const o = await mixedOrder();
      await setLines(o.id, [o.banner], "PRINTING");
      await expectState(o.id, "WORKSHOP_PRINTING", ["WAITING", "WAITING", "WAITING", "PRINTING"]);
      const r = await flag(o.id, o.banner, { reason: "fileCorrupt" });
      expect(r.body).toMatchObject({ oldOrderStatus: "WORKSHOP_PRINTING", newOrderStatus: "SENT_TO_WORKSHOP" });
      await expectState(o.id, "SENT_TO_WORKSHOP", ["WAITING", "WAITING", "WAITING", "NEEDS_LAYOUT"]);
      const st = (await logs(o.id, "status_changed")).at(-1)!;
      expect([st.oldValue, st.newValue, st.metadata]).toEqual(["WORKSHOP_PRINTING", "SENT_TO_WORKSHOP", { derived: true }]);
    });

    it("flag with every other line DONE → order WORKSHOP_PRINTING, never READY", async () => {
      const o = await mixedOrder();
      await setLines(o.id, [o.mug, o.mug2, o.banner], "DONE");
      await flag(o.id, o.notebook, { reason: "lowQuality" });
      await expectState(o.id, "WORKSHOP_PRINTING", ["DONE", "DONE", "NEEDS_LAYOUT", "DONE"]);
    });

    it("clear: back to WAITING, issue fields cleared, logs; clearing a non-flagged line → 409 line_not_flagged", async () => {
      const o = await mixedOrder();
      await flag(o.id, o.mug, { reason: "lowQuality", note: "мыло" });
      const flaggedAt = (await line(o.mug)).layoutIssueAt!;
      const before = (await logs(o.id)).length;
      const r = await clear(o.id, o.mug, "admin");
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body).toMatchObject({ lineStatus: "WAITING", lineCode: code(o, 1), newOrderStatus: "SENT_TO_WORKSHOP" });
      await expectNoIssueFields(o.mug);
      expect((await line(o.mug)).layoutFixedAt).toBeNull(); // a clear is not a fix
      await expectState(o.id, "SENT_TO_WORKSHOP", ["WAITING", "WAITING", "WAITING", "WAITING"]);
      const added = (await logs(o.id)).slice(before);
      expect(added.map((x) => [x.action, x.oldValue, x.newValue, x.userId])).toEqual(
        expect.arrayContaining([
          ["line_status_changed", "NEEDS_LAYOUT", "WAITING", staff.admin.id],
          ["line_layout_cleared", "lowQuality", null, staff.admin.id],
        ]),
      );
      expect(added.find((x) => x.action === "line_layout_cleared")!.metadata).toEqual({
        orderLineId: o.mug,
        lineCode: code(o, 1),
        reason: "lowQuality",
        note: "мыло",
        flaggedAt: flaggedAt.toISOString(),
      });

      expect(await clear(o.id, o.mug)).toMatchObject({ status: 409, body: { error: "line_not_flagged" } });
      await setLines(o.id, [o.banner], "PRINTING");
      expect(await clear(o.id, o.banner)).toMatchObject({ status: 409, body: { error: "line_not_flagged" } });
    });

    it("clear of the line that kept a printing order derived → order follows", async () => {
      const o = await mixedOrder();
      await setLines(o.id, [o.mug, o.mug2, o.banner], "DONE");
      await flag(o.id, o.notebook, { reason: "lowQuality" });
      await setLines(o.id, [o.mug, o.mug2, o.banner], "WAITING");
      await expectState(o.id, "SENT_TO_WORKSHOP", ["WAITING", "WAITING", "NEEDS_LAYOUT", "WAITING"]);
      await clear(o.id, o.notebook);
      await expectState(o.id, "SENT_TO_WORKSHOP", ["WAITING", "WAITING", "WAITING", "WAITING"]);
    });

    it("generic PATCH /lines/status on a flagged line → 409 line_needs_layout, nothing changes (also in a batch)", async () => {
      const o = await mixedOrder();
      await flag(o.id, o.mug, { reason: "lowQuality" });
      for (const s of ["PRINTING", "DONE", "WAITING"]) {
        expect(await setLines(o.id, [o.mug], s)).toMatchObject({ status: 409, body: { error: "line_needs_layout" } });
      }
      expect(await setLines(o.id, [o.mug, o.mug2], "PRINTING")).toMatchObject({ status: 409, body: { error: "line_needs_layout" } });
      await expectState(o.id, "SENT_TO_WORKSHOP", ["NEEDS_LAYOUT", "WAITING", "WAITING", "WAITING"]);
      // Other lines of the same order still move.
      expect((await setLines(o.id, [o.mug2], "PRINTING")).status).toBe(200);
      await expectState(o.id, "WORKSHOP_PRINTING", ["NEEDS_LAYOUT", "PRINTING", "WAITING", "WAITING"]);
    });

    // ─── «Весь заказ» / admin status dropdown never touches a flagged line ───

    async function patchStatus(orderId: string, status: OrderStatus, extra: Record<string, unknown> = {}): Promise<Res> {
      cookieJar.admin = staff.admin.token;
      const r = await read(await patchOrder(req(`/x`, "PATCH", { status, ...extra }), ctx(orderId)));
      cookieJar.admin = null;
      return r;
    }
    async function expectFlagKept(lineId: string, reason = "lowQuality", note: string | null = "n") {
      expect(await line(lineId)).toMatchObject({
        productionStatus: "NEEDS_LAYOUT",
        layoutIssueReason: reason,
        layoutIssueNote: note,
        layoutIssueAt: expect.any(Date),
        layoutIssueById: staff.workshop.id,
      });
    }

    it("order status WORKSHOP_PRINTING: the flagged line keeps its flag, the others print, order WORKSHOP_PRINTING", async () => {
      const o = await mixedOrder();
      await flag(o.id, o.mug2, { reason: "lowQuality", note: "n" });
      const r = await patchStatus(o.id, "WORKSHOP_PRINTING");
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ status: "WORKSHOP_PRINTING", keptNeedsLayoutLines: [code(o, 2)] });
      await expectState(o.id, "WORKSHOP_PRINTING", ["PRINTING", "NEEDS_LAYOUT", "PRINTING", "PRINTING"]);
      await expectFlagKept(o.mug2);
      expect(await logs(o.id, "line_layout_cleared")).toHaveLength(0);
      const st = await logs(o.id, "status_changed");
      expect(st.at(-1)).toMatchObject({ oldValue: "SENT_TO_WORKSHOP", newValue: "WORKSHOP_PRINTING", userId: staff.admin.id });
    });

    it("order status WORKSHOP_READY with a flagged line: stored derived WORKSHOP_PRINTING, the response lists the kept line", async () => {
      const o = await mixedOrder();
      await flag(o.id, o.mug, { reason: "lowQuality", note: "n" });
      const r = await patchStatus(o.id, "WORKSHOP_READY");
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ status: "WORKSHOP_PRINTING", keptNeedsLayoutLines: [code(o, 1)] });
      await expectState(o.id, "WORKSHOP_PRINTING", ["NEEDS_LAYOUT", "DONE", "DONE", "DONE"]);
      await expectFlagKept(o.mug);
      const st = await logs(o.id, "status_changed");
      expect(st).toHaveLength(1);
      expect(st[0]).toMatchObject({ oldValue: "SENT_TO_WORKSHOP", newValue: "WORKSHOP_PRINTING" });
      expect(st[0]!.metadata).toMatchObject({ requested: "WORKSHOP_READY", keptNeedsLayoutLines: [code(o, 1)] });
      expect(await logs(o.id, "line_layout_cleared")).toHaveLength(0);
    });

    it("order status SENT_TO_WORKSHOP (back from printing): the flag is kept", async () => {
      const o = await mixedOrder();
      expect((await setLines(o.id, [o.mug2, o.banner], "PRINTING")).status).toBe(200);
      await flag(o.id, o.mug, { reason: "lowQuality", note: "n" });
      const r = await patchStatus(o.id, "SENT_TO_WORKSHOP");
      expect(r).toMatchObject({ status: 200, body: { status: "SENT_TO_WORKSHOP", keptNeedsLayoutLines: [code(o, 1)] } });
      await expectState(o.id, "SENT_TO_WORKSHOP", ["NEEDS_LAYOUT", "WAITING", "WAITING", "WAITING"]);
      await expectFlagKept(o.mug);
    });

    it("re-sending the same status keeps the flag", async () => {
      const o = await mixedOrder();
      await flag(o.id, o.mug, { reason: "lowQuality", note: "n" });
      const before = (await logs(o.id)).length;
      const r = await patchStatus(o.id, "SENT_TO_WORKSHOP");
      expect(r).toMatchObject({ status: 200, body: { status: "SENT_TO_WORKSHOP", keptNeedsLayoutLines: [code(o, 1)] } });
      await expectState(o.id, "SENT_TO_WORKSHOP", ["NEEDS_LAYOUT", "WAITING", "WAITING", "WAITING"]);
      await expectFlagKept(o.mug);
      expect((await logs(o.id)).length).toBe(before);
      // Same again in printing.
      await patchStatus(o.id, "WORKSHOP_PRINTING");
      const again = await patchStatus(o.id, "WORKSHOP_PRINTING");
      expect(again.body).toMatchObject({ status: "WORKSHOP_PRINTING", keptNeedsLayoutLines: [code(o, 1)] });
      await expectFlagKept(o.mug);
    });

    for (const target of ["DELIVERED", "RETURNED_TO_STUDIO", "READY_IN_STUDIO", "IN_PROGRESS"] as const) {
      it(`order status ${target} with a flagged line: 409 lines_need_layout, nothing written`, async () => {
        const o = await mixedOrder();
        expect((await setLines(o.id, [o.mug2], "DONE")).status).toBe(200);
        await flag(o.id, o.mug, { reason: "lowQuality", note: "n" });
        await flag(o.id, o.banner, { reason: "wrongSize", note: null });
        const orderBefore = await orderRow(o.id);
        const linesBefore = await lines(o.id);
        const logsBefore = (await logs(o.id)).length;
        const r = await patchStatus(o.id, target, { isPrio: true });
        expect(r).toEqual({ status: 409, body: { error: "lines_need_layout", lines: [code(o, 1), code(o, 4)] } });
        expect(await orderRow(o.id)).toEqual(orderBefore);
        expect(await lines(o.id)).toEqual(linesBefore);
        expect((await logs(o.id)).length).toBe(logsBefore);
        await expectFlagKept(o.mug);
      });
    }

    it("DELIVERED works once the flag is lifted, or after the client replaced the file", async () => {
      const a = await mixedOrder();
      await flag(a.id, a.mug, { reason: "lowQuality", note: "n" });
      expect((await patchStatus(a.id, "DELIVERED")).status).toBe(409);
      expect((await clear(a.id, a.mug)).status).toBe(200);
      const ra = await patchStatus(a.id, "DELIVERED");
      expect(ra).toMatchObject({ status: 200, body: { status: "DELIVERED", keptNeedsLayoutLines: [] } });
      await expectState(a.id, "DELIVERED", ["DONE", "DONE", "DONE", "DONE"]);

      const b = await mixedOrder(dealer);
      await flag(b.id, b.mug, { reason: "lowQuality", note: "n" });
      expect((await patchStatus(b.id, "DELIVERED")).status).toBe(409);
      expect((await replace(b.id, b.mug, { files: [{ fileName: "v2.png", fileUrl: uploadKey("v2.png") }] }, dealer)).status).toBe(200);
      expect((await patchStatus(b.id, "DELIVERED")).status).toBe(200);
      await expectState(b.id, "DELIVERED", ["DONE", "DONE", "DONE", "DONE"]);
    });

    it("mug layout save over a flagged order (roll-back to IN_PROGRESS): 409, nothing written", async () => {
      const o = await mixedOrder();
      await flag(o.id, o.mug2, { reason: "lowQuality", note: "n" });
      const filesBefore = (await line(o.mug)).files.map((f) => f.id);
      cookieJar.admin = staff.admin.token;
      const r = await read(
        await patchMugLayout(
          req(`/x`, "PATCH", { mugLayoutData: layout, fileUrl: uploadKey("new-mug.png"), fileName: "new-mug.png", orderLineId: o.mug }),
          ctx(o.id),
        ),
      );
      cookieJar.admin = null;
      expect(r).toEqual({ status: 409, body: { error: "lines_need_layout", lines: [code(o, 2)] } });
      expect((await line(o.mug)).files.map((f) => f.id)).toEqual(filesBefore);
      await expectState(o.id, "SENT_TO_WORKSHOP", ["WAITING", "NEEDS_LAYOUT", "WAITING", "WAITING"]);
      await expectFlagKept(o.mug2);
    });

    it("ISSUE keeps the flagged line and its details", async () => {
      const o = await mixedOrder();
      await flag(o.id, o.mug, { reason: "lowQuality", note: "n" });
      await setOrderStatus(o.id, "ISSUE", { issueReason: "клиент не отвечает" });
      expect(await line(o.mug)).toMatchObject({ productionStatus: "NEEDS_LAYOUT", layoutIssueReason: "lowQuality", layoutIssueNote: "n" });
    });
  });

  // ─── Cabinet replacement ────────────────────────────────────────────────

  describe("cabinet: the owner replaces the file", () => {
    it("auth: anonymous 401; another client's order 404 with the same body as a missing one; foreign line 404", async () => {
      const o = await mixedOrder(dealer);
      await flag(o.id, o.mug, { reason: "lowQuality" });
      const body = { files: [{ fileName: "new.png", fileUrl: uploadKey("new.png") }] };
      expect((await replace(o.id, o.mug, body, null)).status).toBe(401);
      const foreign = await replace(o.id, o.mug, body, stranger);
      const missing = await replace("00000000-0000-0000-0000-000000000000", o.mug, body, stranger);
      expect(foreign).toEqual({ status: 404, body: { error: "Not found" } });
      expect(missing).toEqual(foreign);
      const other = await mixedOrder(dealer);
      expect(await replace(o.id, other.mug, body, dealer)).toEqual(foreign);
      // A staff session is not a cabinet session.
      cookieJar.admin = staff.admin.token;
      expect((await replaceRoute(req(`/x`, "POST", body), lineCtx(o.id, o.mug))).status).toBe(401);
      cookieJar.admin = null;
      expect((await line(o.mug)).productionStatus).toBe("NEEDS_LAYOUT");
    });

    it("validation: bad file key, empty list, missing fields, bad JSON → 400; a non-flagged line → 409", async () => {
      const o = await mixedOrder(dealer);
      await flag(o.id, o.mug, { reason: "lowQuality" });
      for (const body of [
        { files: [] },
        {},
        { files: [{ fileName: "x.png" }] },
        { files: [{ fileName: "x.png", fileUrl: "uploads/it-lli/x.png" }] },
        { files: [{ fileName: "x.png", fileUrl: "https://evil.example/x.png" }] },
        { files: [{ fileName: "x.png", fileUrl: "../uploads/1730000000000-abcdEFGH-x.png" }] },
      ]) {
        const r = await replace(o.id, o.mug, body, dealer);
        expect(r.status, JSON.stringify(body)).toBe(400);
      }
      cookieJar.customer = dealer.token;
      expect((await replaceRoute(req(`/x`, "POST", "{bad"), lineCtx(o.id, o.mug))).status).toBe(400);
      cookieJar.customer = null;
      expect(await replace(o.id, o.mug2, { files: [{ fileName: "n.png", fileUrl: uploadKey("n.png") }] }, dealer)).toMatchObject({
        status: 409,
        body: { error: "line_not_flagged" },
      });
      expect((await line(o.mug)).productionStatus).toBe("NEEDS_LAYOUT");
      expect(await prisma.orderFileArchive.count({ where: { orderId: o.id } })).toBe(0);
    });

    it("works while other lines print: only that line changes; price, stock, edit / cancel lock unchanged; logs", async () => {
      const o = await mixedOrder(dealer);
      await setLines(o.id, [o.banner], "PRINTING");
      await setLines(o.id, [o.mug], "DONE");
      const r0 = await flag(o.id, o.mug2, { reason: "lowQuality", note: "размыто" });
      expect(r0.status).toBe(200);
      await expectState(o.id, "WORKSHOP_PRINTING", ["DONE", "NEEDS_LAYOUT", "WAITING", "PRINTING"]);
      const flaggedAt = (await line(o.mug2)).layoutIssueAt!;

      // Printing → the dealer cannot cancel or edit (the flag does not unlock it).
      expect(await cancel(o.id, dealer)).toMatchObject({ status: 409, body: { code: "order_locked" } });
      const detail0 = await cabinetDetail(o.id, dealer);
      expect(detail0.body).toMatchObject({ dealerActions: "locked", dealerLockReason: "printing" });

      const priceBefore = Number((await orderRow(o.id)).price);
      const stockBefore = await stockSnapshot(o.id);
      const otherLinesBefore = (await lines(o.id)).filter((l) => l.id !== o.mug2);
      const oldFile = (await line(o.mug2)).files[0]!;
      const before = (await logs(o.id)).length;

      const newKey = uploadKey("mug-b-v2.png");
      const r = await replace(o.id, o.mug2, { files: [{ fileName: "mug-b-v2.png", fileUrl: newKey }] }, dealer);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body).toMatchObject({ orderId: o.id, lineId: o.mug2, lineStatus: "WAITING" });
      expect(typeof r.body.layoutFixedAt).toBe("string");
      expect(r.body.files).toEqual([{ id: expect.any(String), fileName: "mug-b-v2.png" }]);

      // The line: WAITING, fixed by the dealer, issue details gone; new file inherits copies / colour.
      const l = await line(o.mug2);
      expect(l).toMatchObject({ productionStatus: "WAITING", layoutFixedById: dealer.userId });
      expect(l.layoutFixedAt!.toISOString()).toBe(r.body.layoutFixedAt);
      await expectNoIssueFields(o.mug2);
      expect(l.files.map((f) => [f.fileName, f.fileUrl, f.copies, f.color, f.orderId])).toEqual([
        ["mug-b-v2.png", newKey, oldFile.copies, oldFile.color, o.id],
      ]);
      expect(await prisma.file.count({ where: { id: oldFile.id } })).toBe(0);

      // Old file archived with reason layout_issue.
      const archive = await prisma.orderFileArchive.findMany({ where: { orderId: o.id } });
      expect(archive.map((a) => [a.orderLineId, a.fileName, a.fileUrl, a.copies, a.reason, a.archivedById, a.lineProductType])).toEqual([
        [o.mug2, oldFile.fileName, oldFile.fileUrl, oldFile.copies, "layout_issue", dealer.userId, "mug"],
      ]);

      // Everything else untouched; order status consistent.
      await expectState(o.id, "WORKSHOP_PRINTING", ["DONE", "WAITING", "WAITING", "PRINTING"]);
      const otherLinesAfter = (await lines(o.id)).filter((x) => x.id !== o.mug2);
      expect(otherLinesAfter).toEqual(otherLinesBefore);
      expect(Number((await orderRow(o.id)).price)).toBe(priceBefore);
      expect(await stockSnapshot(o.id)).toEqual(stockBefore);

      // Logs.
      const added = (await logs(o.id)).slice(before);
      expect(added.map((x) => [x.action, x.oldValue, x.newValue, x.userId])).toEqual(
        expect.arrayContaining([
          ["line_status_changed", "NEEDS_LAYOUT", "WAITING", dealer.userId],
          ["line_layout_fixed", oldFile.fileName, "mug-b-v2.png", dealer.userId],
        ]),
      );
      expect(added).toHaveLength(2);
      expect(added.find((x) => x.action === "line_layout_fixed")!.metadata).toMatchObject({
        orderLineId: o.mug2,
        lineCode: code(o, 2),
        by: "client",
        reason: "lowQuality",
        note: "размыто",
        flaggedAt: flaggedAt.toISOString(),
        archivedFiles: [{ id: archive[0]!.id, fileName: oldFile.fileName }],
        files: [{ id: l.files[0]!.id, fileName: "mug-b-v2.png" }],
      });

      // Still locked after the replacement.
      expect(await cancel(o.id, dealer)).toMatchObject({ status: 409, body: { code: "order_locked" } });
      expect((await orderRow(o.id)).deletedAt).toBeNull();
      // A second replacement is refused: the line is not flagged any more.
      expect(await replace(o.id, o.mug2, { files: [{ fileName: "v3.png", fileUrl: uploadKey("v3.png") }] }, dealer)).toMatchObject({
        status: 409,
        body: { error: "line_not_flagged" },
      });
    });

    it("dealer PUT edit is refused with 409 order_locked on a printing order with a flagged line, before and after the fix", async () => {
      const o = await mixedOrder(dealer);
      await setLines(o.id, [o.banner], "PRINTING");
      await flag(o.id, o.mug, { reason: "lowQuality" });
      const tryEdit = async () => {
        const ls = await lines(o.id);
        cookieJar.customer = dealer.token;
        const res = await read(
          await putCabinetOrder(
            req(`/x`, "PUT", {
              notes: "late",
              lines: [{ orderLineId: ls[0]!.id, productType: "mug", mugProductId: mugId, files: [{ fileId: ls[0]!.files[0]!.id, copies: 1 }] }],
            }),
            ctx(o.id),
          ),
        );
        cookieJar.customer = null;
        return res;
      };
      expect(await tryEdit()).toMatchObject({ status: 409, body: { code: "order_locked" } });
      expect((await replace(o.id, o.mug, { files: [{ fileName: "v2.png", fileUrl: uploadKey("v2.png") }] }, dealer)).status).toBe(200);
      expect(await tryEdit()).toMatchObject({ status: 409, body: { code: "order_locked" } });
      expect((await lines(o.id))).toHaveLength(4);
    });

    it("several new files at once are refused (one file per replace): 400, the line stays flagged with its file", async () => {
      const o = await mixedOrder(dealer);
      await flag(o.id, o.mug2, { reason: "wrongFormat" });
      const r = await replace(
        o.id,
        o.mug2,
        { files: [{ fileName: "a.png", fileUrl: uploadKey("a.png") }, { fileName: "b.png", fileUrl: uploadKey("b.png") }] },
        dealer,
      );
      expect(r).toMatchObject({ status: 400, body: { error: "invalid_file", detail: "single_file" } });
      const l = await line(o.mug2);
      expect(l.productionStatus).toBe("NEEDS_LAYOUT");
      expect(l.files.map((f) => [f.fileName, f.copies])).toHaveLength(1);
      expect(l.files[0]!.copies).toBe(2);
    });

    it("a retail (non-dealer) owner can replace too", async () => {
      const o = await mixedOrder(retail);
      await flag(o.id, o.notebook, { reason: "missingPages" });
      const r = await replace(o.id, o.notebook, { files: [{ fileName: "nb2.png", fileUrl: uploadKey("nb2.png") }] }, retail);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(await line(o.notebook)).toMatchObject({ productionStatus: "WAITING", layoutFixedById: retail.userId });
      await expectState(o.id, "SENT_TO_WORKSHOP", ["WAITING", "WAITING", "WAITING", "WAITING"]);
      // Retail clients never get dealer actions.
      expect((await cabinetDetail(o.id, retail)).body).toMatchObject({ dealerActions: "hidden", dealerLockReason: null });
    });

    it("a dealer-cancelled order cannot be fixed (404)", async () => {
      const o = await mixedOrder(dealer);
      await flag(o.id, o.mug, { reason: "lowQuality" });
      // All lines waiting / flagged → the dealer may still cancel.
      expect((await cancel(o.id, dealer)).status).toBe(200);
      expect((await replace(o.id, o.mug, { files: [{ fileName: "x.png", fileUrl: uploadKey("x.png") }] }, dealer)).status).toBe(404);
    });

    it("cabinet detail / list / unread expose the flag before the fix and not after", async () => {
      const owner = await makeCustomer(true, 7);
      try {
        const o = await mixedOrder(owner);
        const plain = await mixedOrder(owner);
        // Nothing flagged yet.
        expect((await unread(owner)).body).toMatchObject({ layoutIssueOrders: [] });
        expect(((await cabinetList(owner)).body.summary as Record<string, unknown>).needsLayoutCount).toBe(0);

        await flag(o.id, o.mug2, { reason: "wrongSize", note: "90×50" });
        await flag(o.id, o.notebook, { reason: "lowQuality" });
        const flaggedAt = (await line(o.mug2)).layoutIssueAt!.toISOString();

        const d = await cabinetDetail(o.id, owner);
        expect(d.status).toBe(200);
        const dl = d.body.orderLines as Array<{ id?: string; layoutIssue: unknown; layoutFixedAt: unknown }>;
        expect(dl.map((x) => x.layoutIssue)).toEqual([
          null,
          { reason: "wrongSize", note: "90×50", since: flaggedAt },
          { reason: "lowQuality", note: null, since: expect.any(String) },
          null,
        ]);
        expect(JSON.stringify(d.body)).not.toContain(staff.workshop.id); // no staff id leaks
        // Every line waits or waits for a layout → the dealer may still edit / cancel.
        expect(d.body).toMatchObject({ dealerActions: "editable", dealerLockReason: null });

        const list = await cabinetList(owner);
        expect(list.status).toBe(200);
        const rows = list.body.orders as Array<{ id: string; needsLayoutCount: number; orderLines: Array<{ layoutIssue: unknown }> }>;
        expect(rows[0]!.id).toBe(o.id); // flagged orders first
        expect(rows.find((x) => x.id === o.id)!.needsLayoutCount).toBe(2);
        expect(rows.find((x) => x.id === plain.id)!.needsLayoutCount).toBe(0);
        expect(rows.find((x) => x.id === o.id)!.orderLines.filter((x) => x.layoutIssue !== null)).toHaveLength(2);
        expect((list.body.summary as Record<string, unknown>).needsLayoutCount).toBe(1);
        const filtered = await cabinetList(owner, "?status=needsLayout");
        expect((filtered.body.orders as Array<{ id: string }>).map((x) => x.id)).toEqual([o.id]);

        const u = await unread(owner);
        expect(u.body.layoutIssueOrders).toEqual([{ id: o.id, orderNumber: o.orderNumber, lineCount: 2, since: expect.any(String) }]);
        // Another customer sees nothing of it.
        expect(((await unread(stranger)).body.layoutIssueOrders as Array<{ id: string }>).some((x) => x.id === o.id)).toBe(false);

        // Fix both: nothing exposed any more; layoutFixedAt shown.
        expect((await replace(o.id, o.mug2, { files: [{ fileName: "m.png", fileUrl: uploadKey("m.png") }] }, owner)).status).toBe(200);
        expect((await unread(owner)).body.layoutIssueOrders).toEqual([
          { id: o.id, orderNumber: o.orderNumber, lineCount: 1, since: expect.any(String) },
        ]);
        await clear(o.id, o.notebook);
        const d2 = await cabinetDetail(o.id, owner);
        const dl2 = d2.body.orderLines as Array<{ layoutIssue: unknown; layoutFixedAt: unknown }>;
        expect(dl2.map((x) => x.layoutIssue)).toEqual([null, null, null, null]);
        expect(typeof dl2[1]!.layoutFixedAt).toBe("string");
        expect(dl2[2]!.layoutFixedAt).toBeNull();
        expect((await unread(owner)).body.layoutIssueOrders).toEqual([]);
        const list2 = await cabinetList(owner);
        expect((list2.body.summary as Record<string, unknown>).needsLayoutCount).toBe(0);
        expect((list2.body.orders as Array<{ needsLayoutCount: number }>).every((x) => x.needsLayoutCount === 0)).toBe(true);
        expect(((await cabinetList(owner, "?status=needsLayout")).body.orders as unknown[])).toEqual([]);
      } finally {
        await prisma.order.deleteMany({ where: { clientId: owner.customerId } });
        await prisma.user.deleteMany({ where: { id: owner.userId } });
        await prisma.studioCustomer.deleteMany({ where: { id: owner.customerId } });
      }
    });

    it("dealer edit of a waiting order replacing the flagged line's file also returns it to WAITING (logged as by the client)", async () => {
      cookieJar.customer = dealer.token;
      const created = await read(
        await createCabinetOrder(
          req("/api/cabinet/orders", "POST", {
            lines: [
              { productType: "mug", mugProductId: mugId, mugLayoutData: layout, files: [{ fileName: "d1.png", fileUrl: uploadKey("d1.png"), copies: 1, color: "color" }] },
              { productType: "mug", mugProductId: mugId, mugLayoutData: layout, files: [{ fileName: "d2.png", fileUrl: uploadKey("d2.png"), copies: 1, color: "color" }] },
            ],
          }),
        ),
      );
      cookieJar.customer = null;
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      const id = created.body.id as string;
      createdIds.push(id);
      await setOrderStatus(id, "SENT_TO_WORKSHOP");
      const ls = await lines(id);
      await flag(id, ls[1]!.id, { reason: "lowQuality" });
      const newKey = uploadKey("d2-v2.png");
      cookieJar.customer = dealer.token;
      const put = await read(
        await putCabinetOrder(
          req(`/x`, "PUT", {
            lines: [
              { orderLineId: ls[0]!.id, productType: "mug", mugProductId: mugId, files: [{ fileId: ls[0]!.files[0]!.id, copies: 1 }] },
              { orderLineId: ls[1]!.id, productType: "mug", mugProductId: mugId, files: [{ fileName: "d2-v2.png", fileUrl: newKey, copies: 1, color: "color" }] },
            ],
          }),
          ctx(id),
        ),
      );
      cookieJar.customer = null;
      expect(put.status, JSON.stringify(put.body)).toBe(200);
      const after = await lines(id);
      expect(after.map((l) => l.productionStatus)).toEqual(["WAITING", "WAITING"]);
      const fixedLine = after.find((l) => l.files.some((f) => f.fileUrl === newKey))!;
      expect(fixedLine.layoutFixedAt).not.toBeNull();
      expect(fixedLine.layoutFixedById).toBe(dealer.userId);
      await expectNoIssueFields(fixedLine.id);
      const fixed = await logs(id, "line_layout_fixed");
      expect(fixed).toHaveLength(1);
      expect(fixed[0]!.userId).toBe(dealer.userId);
      expect((fixed[0]!.metadata as { by: string }).by).toBe("client");
      await expectState(id, "SENT_TO_WORKSHOP", ["WAITING", "WAITING"]);
    });
  });

  // ─── Races ───────────────────────────────────────────────────────────────

  describe("race: staff clear vs owner replace", () => {
    const actor = () => ({ userId: dealer.userId, studioCustomerId: dealer.customerId });
    const files = () => [{ fileName: "race.png", fileUrl: uploadKey("race.png") }];

    async function expectCode(p: Promise<unknown>, codeName: string) {
      const err = await p.then(
        () => null,
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(LayoutIssueError);
      expect((err as LayoutIssueError).code).toBe(codeName);
    }

    it("the clear commits just before the replace locks → replace gets line_not_flagged, file untouched", async () => {
      const o = await mixedOrder(dealer);
      await flag(o.id, o.mug, { reason: "lowQuality" });
      const oldFiles = (await line(o.mug)).files.map((f) => f.id);
      await expectCode(
        ownerReplaceLayoutFile(prisma, {
          orderId: o.id,
          lineId: o.mug,
          actor: actor(),
          files: files(),
          hooks: { beforeLock: async () => void (await clearLineLayoutIssue(prisma, { orderId: o.id, lineId: o.mug, userId: staff.workshop.id })) },
        }),
        "line_not_flagged",
      );
      const l = await line(o.mug);
      expect(l.productionStatus).toBe("WAITING");
      expect(l.layoutFixedAt).toBeNull();
      expect(l.files.map((f) => f.id)).toEqual(oldFiles);
      expect(await prisma.orderFileArchive.count({ where: { orderId: o.id } })).toBe(0);
      expect(await logs(o.id, "line_layout_cleared")).toHaveLength(1);
      expect(await logs(o.id, "line_layout_fixed")).toHaveLength(0);
      await expectState(o.id, "SENT_TO_WORKSHOP", ["WAITING", "WAITING", "WAITING", "WAITING"]);
    });

    it("the replace holds the lock while the clear starts → the clear waits, then gets line_not_flagged", async () => {
      const o = await mixedOrder(dealer);
      await flag(o.id, o.mug, { reason: "lowQuality" });
      let clearP: Promise<unknown> | null = null;
      let clearSettledEarly = false;
      const res = await ownerReplaceLayoutFile(prisma, {
        orderId: o.id,
        lineId: o.mug,
        actor: actor(),
        files: files(),
        hooks: {
          afterLock: async () => {
            clearP = clearLineLayoutIssue(prisma, { orderId: o.id, lineId: o.mug, userId: staff.workshop.id });
            clearP.then(
              () => (clearSettledEarly = true),
              () => (clearSettledEarly = true),
            );
            await sleep(400);
            // The row is locked by us: the clear cannot have finished.
            expect(clearSettledEarly).toBe(false);
          },
        },
      });
      expect(res.lineStatus).toBe("WAITING");
      await expectCode(clearP!, "line_not_flagged");
      const l = await line(o.mug);
      expect(l.productionStatus).toBe("WAITING");
      expect(l.layoutFixedAt).not.toBeNull();
      expect(await logs(o.id, "line_layout_cleared")).toHaveLength(0);
      expect(await logs(o.id, "line_layout_fixed")).toHaveLength(1);
      expect(await prisma.orderFileArchive.count({ where: { orderId: o.id, reason: "layout_issue" } })).toBe(1);
      await expectState(o.id, "SENT_TO_WORKSHOP", ["WAITING", "WAITING", "WAITING", "WAITING"]);
    });

    it("the clear holds the lock while the replace starts → the replace waits, then gets line_not_flagged", async () => {
      const o = await mixedOrder(dealer);
      await flag(o.id, o.mug, { reason: "lowQuality" });
      let replaceP: Promise<unknown> | null = null;
      await clearLineLayoutIssue(prisma, {
        orderId: o.id,
        lineId: o.mug,
        userId: staff.workshop.id,
        hooks: {
          afterLock: async () => {
            replaceP = ownerReplaceLayoutFile(prisma, { orderId: o.id, lineId: o.mug, actor: actor(), files: files() });
            replaceP.catch(() => undefined);
            await sleep(400);
          },
        },
      });
      await expectCode(replaceP!, "line_not_flagged");
      const l = await line(o.mug);
      expect(l).toMatchObject({ productionStatus: "WAITING", layoutFixedAt: null });
      expect(await prisma.orderFileArchive.count({ where: { orderId: o.id } })).toBe(0);
    });

    it("concurrent, no seams: exactly one wins, the other gets line_not_flagged; state consistent", async () => {
      for (let round = 0; round < 3; round++) {
        const o = await mixedOrder(dealer);
        await flag(o.id, o.mug, { reason: "lowQuality" });
        const [a, b] = await Promise.allSettled([
          clearLineLayoutIssue(prisma, { orderId: o.id, lineId: o.mug, userId: staff.workshop.id }),
          ownerReplaceLayoutFile(prisma, { orderId: o.id, lineId: o.mug, actor: actor(), files: files() }),
        ]);
        const fulfilled = [a, b].filter((x) => x.status === "fulfilled");
        const rejected = [a, b].filter((x): x is PromiseRejectedResult => x.status === "rejected");
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect((rejected[0]!.reason as LayoutIssueError).code).toBe("line_not_flagged");
        const l = await line(o.mug);
        expect(l.productionStatus).toBe("WAITING");
        const replaceWon = b.status === "fulfilled";
        expect(l.layoutFixedAt !== null).toBe(replaceWon);
        expect(await prisma.orderFileArchive.count({ where: { orderId: o.id } })).toBe(replaceWon ? 1 : 0);
        expect((await logs(o.id, "line_layout_fixed")).length + (await logs(o.id, "line_layout_cleared")).length).toBe(1);
        await expectState(o.id, "SENT_TO_WORKSHOP", ["WAITING", "WAITING", "WAITING", "WAITING"]);
      }
    });

    it("two concurrent replacements by the owner: one wins, one line_not_flagged, one archive row", async () => {
      const o = await mixedOrder(dealer);
      await flag(o.id, o.mug, { reason: "lowQuality" });
      const results = await Promise.allSettled([
        ownerReplaceLayoutFile(prisma, { orderId: o.id, lineId: o.mug, actor: actor(), files: files() }),
        ownerReplaceLayoutFile(prisma, { orderId: o.id, lineId: o.mug, actor: actor(), files: files() }),
      ]);
      expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      expect(await prisma.orderFileArchive.count({ where: { orderId: o.id } })).toBe(1);
      expect((await line(o.mug)).files).toHaveLength(1);
    });

    it("flag racing a PRINTING batch: the batch after the flag gets line_needs_layout", async () => {
      const o = await mixedOrder();
      await flag(o.id, o.mug, { reason: "lowQuality" });
      expect(await setLines(o.id, [o.mug, o.mug2], "PRINTING")).toMatchObject({ status: 409, body: { error: "line_needs_layout" } });
    });
  });

  // ─── Staff replacement through the admin edit ───────────────────────────

  describe("staff replacement through the admin edit", () => {
    async function twoLineOrder() {
      cookieJar.admin = staff.admin.token;
      const res = await read(
        await createAdminOrder(
          req("/api/admin/orders", "POST", {
            phone,
            lines: [
              { productType: "mug", mugProductId: mugId, mugLayoutData: layout, files: [{ fileName: "s-mug.png", fileUrl: "uploads/it-lli/s-mug.png", copies: 1, color: "color" }] },
              { productType: "notebook", notebookProductId: notebookId, notebookLayoutData: layout, files: [{ fileName: "s-nb.png", fileUrl: "uploads/it-lli/s-nb.png", copies: 1, color: "color" }] },
            ],
          }),
        ),
      );
      cookieJar.admin = null;
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      const id = res.body.id as string;
      createdIds.push(id);
      const ls = await lines(id);
      return { id, orderNumber: res.body.orderNumber as number, mug: ls[0]!, notebook: ls[1]! };
    }

    async function adminPatch(id: string, mugFiles: unknown[], nbFiles: unknown[]) {
      cookieJar.admin = staff.admin.token;
      const r = await read(
        await patchAdminOrder(
          req(`/x`, "PATCH", {
            phone,
            lines: [
              { orderLineId: (await lines(id))[0]!.id, productType: "mug", mugProductId: mugId, mugLayoutData: layout, files: mugFiles },
              { orderLineId: (await lines(id))[1]!.id, productType: "notebook", notebookProductId: notebookId, notebookLayoutData: layout, files: nbFiles },
            ],
          }),
          ctx(id),
        ),
      );
      cookieJar.admin = null;
      return r;
    }

    it("keeping the same file does not un-flag", async () => {
      const o = await twoLineOrder();
      await flag(o.id, o.mug.id, { reason: "lowQuality", note: "n" });
      const r = await adminPatch(o.id, [{ fileId: o.mug.files[0]!.id, copies: 1 }], [{ fileId: o.notebook.files[0]!.id, copies: 1 }]);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      const l = await line(o.mug.id);
      expect(l).toMatchObject({ productionStatus: "NEEDS_LAYOUT", layoutIssueReason: "lowQuality", layoutIssueNote: "n", layoutFixedAt: null });
      expect(await prisma.orderFileArchive.count({ where: { orderId: o.id } })).toBe(0);
      expect(await logs(o.id, "line_layout_fixed")).toHaveLength(0);
      // Changing only copies on the same file does not un-flag either.
      const r2 = await adminPatch(o.id, [{ fileId: o.mug.files[0]!.id, copies: 3 }], [{ fileId: o.notebook.files[0]!.id, copies: 1 }]);
      expect(r2.status, JSON.stringify(r2.body)).toBe(200);
      expect((await line(o.mug.id)).productionStatus).toBe("NEEDS_LAYOUT");
      await expectState(o.id, "SENT_TO_WORKSHOP", ["NEEDS_LAYOUT", "WAITING"]);
    });

    it("replacing the flagged line's file: WAITING + layoutFixedAt by staff, old file archived (layout_issue), log by staff", async () => {
      const o = await twoLineOrder();
      await setLines(o.id, [o.notebook.id], "PRINTING");
      await flag(o.id, o.mug.id, { reason: "wrongFormat", note: "CMYK" });
      const flaggedAt = (await line(o.mug.id)).layoutIssueAt!;
      const r = await adminPatch(
        o.id,
        [{ fileName: "s-mug-v2.png", fileUrl: "uploads/it-lli/s-mug-v2.png", copies: 1, color: "color" }],
        [{ fileId: o.notebook.files[0]!.id, copies: 1 }],
      );
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      const ls = await lines(o.id);
      const mug = ls.find((l) => l.productType === "mug")!;
      expect(mug).toMatchObject({ productionStatus: "WAITING", layoutFixedById: staff.admin.id });
      expect(mug.layoutFixedAt).not.toBeNull();
      await expectNoIssueFields(mug.id);
      expect(mug.files.map((f) => f.fileName)).toEqual(["s-mug-v2.png"]);
      // The notebook kept its status and file (staff edit does not archive it).
      expect(ls.find((l) => l.productType === "notebook")!.productionStatus).toBe("PRINTING");
      const archive = await prisma.orderFileArchive.findMany({ where: { orderId: o.id } });
      expect(archive.map((a) => [a.fileName, a.reason, a.archivedById, a.orderLineId])).toEqual([
        ["s-mug.png", "layout_issue", staff.admin.id, mug.id],
      ]);
      const fixed = await logs(o.id, "line_layout_fixed");
      expect(fixed).toHaveLength(1);
      expect(fixed[0]!.userId).toBe(staff.admin.id);
      expect(fixed[0]!.metadata).toMatchObject({
        orderLineId: mug.id,
        lineCode: code(o, 1, 2),
        by: "staff",
        reason: "wrongFormat",
        note: "CMYK",
        flaggedAt: flaggedAt.toISOString(),
        archivedFiles: [{ id: archive[0]!.id, fileName: "s-mug.png" }],
      });
      const lsc = (await logs(o.id, "line_status_changed")).at(-1)!;
      expect([lsc.oldValue, lsc.newValue, (lsc.metadata as { lineCode: string }).lineCode]).toEqual(["NEEDS_LAYOUT", "WAITING", code(o, 1, 2)]);
      await expectState(o.id, "WORKSHOP_PRINTING", ["WAITING", "PRINTING"]);
    });

    it("a staff edit that drops a file of a non-flagged line archives nothing", async () => {
      const o = await twoLineOrder();
      const r = await adminPatch(
        o.id,
        [{ fileName: "other.png", fileUrl: "uploads/it-lli/other.png", copies: 1, color: "color" }],
        [{ fileId: o.notebook.files[0]!.id, copies: 1 }],
      );
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(await prisma.orderFileArchive.count({ where: { orderId: o.id } })).toBe(0);
      expect((await lines(o.id))[0]!.layoutFixedAt).toBeNull();
    });
  });

  // ─── Board: mug batch selection ─────────────────────────────────────────

  it("mug batch: a flagged mug is excluded, its sibling mug and other orders' mugs are included", async () => {
    const o = await mixedOrder();
    const other = await mixedOrder();
    await flag(o.id, o.mug2, { reason: "lowQuality", note: "x" });
    const board = await fetchWorkshopBoardData({ id: staff.workshop.id, name: "w", role: "workshop" }, { search: phone });
    const mugSection = board.sections.find((s) => s.productType === "mug")!;
    const boardLines = mugSection.groups.flatMap((g) => g.lines);
    const held = boardLines.find((l) => l.orderLineId === o.mug2)!;
    expect(held.lineStatus).toBe("NEEDS_LAYOUT");
    expect(held.layoutIssue).toMatchObject({ reason: "lowQuality", note: "x", since: expect.any(String) });
    // Flagged lines sort first in their group (earlier tests may have left other flagged mugs).
    const grp = mugSection.groups.find((g) => g.lines.some((l) => l.orderLineId === o.mug2))!;
    const statuses = grp.lines.map((l) => l.lineStatus);
    const firstOther = statuses.findIndex((s) => s !== "NEEDS_LAYOUT");
    expect(statuses.slice(firstOther).includes("NEEDS_LAYOUT")).toBe(false);
    expect(grp.lines.findIndex((l) => l.orderLineId === o.mug2)).toBeLessThan(firstOther);

    const snap = mugLineStatusSnapshot(mugSection);
    expect(snap.get(`${o.id}::${o.mug2}`)).toBe("NEEDS_LAYOUT");
    const fresh = new Set(filterMugTilesReadyForBatch(flattenMugSectionTiles(mugSection), snap).map((t) => t.orderLineId));
    expect(fresh.has(o.mug2)).toBe(false);
    expect(fresh.has(o.mug)).toBe(true);
    expect(fresh.has(other.mug)).toBe(true);
    expect(fresh.has(other.mug2)).toBe(true);

    // After the clear it is batchable again.
    await clear(o.id, o.mug2);
    const board2 = await fetchWorkshopBoardData({ id: staff.workshop.id, name: "w", role: "workshop" }, { search: phone });
    const sec2 = board2.sections.find((s) => s.productType === "mug")!;
    const fresh2 = new Set(filterMugTilesReadyForBatch(flattenMugSectionTiles(sec2), mugLineStatusSnapshot(sec2)).map((t) => t.orderLineId));
    expect(fresh2.has(o.mug2)).toBe(true);
  });

  // ─── Dealer lock: order-level ISSUE while a line prints ─────────────────

  it("dealer lock: ISSUE set while a line is PRINTING → dealer cancel / edit refused (409 order_locked)", async () => {
    const o = await mixedOrder(dealer);
    await setLines(o.id, [o.banner], "PRINTING");
    await setOrderStatus(o.id, "ISSUE", { issueReason: "файл битый" });
    expect((await orderRow(o.id)).status).toBe("ISSUE");
    expect((await lines(o.id)).map((l) => l.productionStatus)).toEqual(["WAITING", "WAITING", "WAITING", "PRINTING"]);
    expect(await cancel(o.id, dealer)).toMatchObject({ status: 409, body: { code: "order_locked" } });
    const ls = await lines(o.id);
    cookieJar.customer = dealer.token;
    const put = await read(
      await putCabinetOrder(
        req(`/x`, "PUT", {
          lines: [{ orderLineId: ls[0]!.id, productType: "mug", mugProductId: mugId, files: [{ fileId: ls[0]!.files[0]!.id, copies: 1 }] }],
        }),
        ctx(o.id),
      ),
    );
    cookieJar.customer = null;
    expect(put).toMatchObject({ status: 409, body: { code: "order_locked" } });
    expect((await cabinetDetail(o.id, dealer)).body).toMatchObject({ dealerActions: "locked", dealerLockReason: "printing" });
    expect(await lines(o.id)).toHaveLength(4);
    expect((await orderRow(o.id)).deletedAt).toBeNull();

    // ISSUE with every line waiting stays editable (the old rule).
    const w = await mixedOrder(dealer);
    await setOrderStatus(w.id, "ISSUE", { issueReason: "вопрос" });
    expect((await cabinetDetail(w.id, dealer)).body).toMatchObject({ dealerActions: "editable" });
    expect((await cancel(w.id, dealer)).status).toBe(200);
  });

  it("all orders this suite touched pass the invariant check", async () => {
    const res = await checkLineStatusSync(prisma, { orderIds: createdIds });
    expect(res.ordersChecked).toBeGreaterThan(5);
    expect(res.mismatches).toEqual([]);
  });
});
