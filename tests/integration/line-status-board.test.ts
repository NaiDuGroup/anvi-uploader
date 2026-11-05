/**
 * Per-line production status, step 2: the workshop sets a status per line
 * (`PATCH /api/orders/[id]/lines/status`, `PATCH /api/workshop-board/line-status`)
 * and, in the workshop phase, the order status is derived from its lines in the
 * same transaction. The order-level PATCH still moves every line (step 1), the
 * dealer lock follows the derived status, and the batch runners' status step
 * touches only the batched lines.
 *
 * Route handlers run in-process with real sessions against a LOCAL database
 * (refuses any other DATABASE_URL). Run with
 * `npx vitest run --config vitest.integration.config.ts tests/integration/line-status-board.test.ts`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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
import { PATCH as patchOrder, DELETE as trashOrder } from "@/app/api/orders/[id]/route";
import { PATCH as patchLineStatus } from "@/app/api/orders/[id]/lines/status/route";
import { PATCH as patchBoardLineStatus } from "@/app/api/workshop-board/line-status/route";
import { POST as createCabinetOrder } from "@/app/api/cabinet/orders/route";
import { PUT as putCabinetOrder } from "@/app/api/cabinet/orders/[id]/route";
import { canDealerModifyOrder, dealerOrderActionsState } from "@/lib/dealerOrderModify";
import { checkLineStatusSync } from "@/lib/orderLineStatusCheck";
import { fetchWorkshopBoardData } from "@/lib/fetchWorkshopBoardData";
import { markLinesPrinting } from "@/lib/workshopBoard/lineStatusClient";
import {
  filterMugTilesReadyForBatch,
  flattenMugSectionTiles,
  mugLineStatusSnapshot,
} from "@/lib/workshopBoard/mugBatchFromSection";
import {
  filterTilesReadyForBatch,
  flattenNotebookSectionTiles,
  notebookLineStatusSnapshot,
} from "@/lib/workshopBoard/notebookBatchFromSection";
import type { OrderStatus } from "@/lib/validations";
import { cleanupTestMugs, createTestMug } from "./mugSeed";
import { cleanupTestNotebook, createTestNotebook } from "./notebookSeed";
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

const stamp = `${Date.now()}`.slice(-7);

describe.skipIf(!isLocalDb)("integration: per-line production status on the workshop board (step 2)", () => {
  let mugId: string;
  let notebookId: string;
  let lf: TestLfMaterial;
  let dealerCustomerId: string;
  let dealerToken: string;
  const users: Record<"admin" | "workshop" | "superadmin" | "viewer" | "dealer", { id: string; token: string }> =
    {} as never;
  const phone = `+3735${stamp}1`;
  const createdIds: string[] = [];

  beforeAll(async () => {
    mugId = (await createTestMug(200, { sellPrice: 100, skuPrefix: "IT-LSB" })).id;
    notebookId = (await createTestNotebook(200, "IT-LSB-NB")).id;
    lf = await createTestLfMaterial(`IT LSB BANNER ${stamp}`, { stockLm: 100 });
    const customer = await prisma.studioCustomer.create({
      data: { kind: "INDIVIDUAL", phone: `+3735${stamp}2`, personName: `IT lsb ${stamp}`, isDealer: true },
    });
    dealerCustomerId = customer.id;
    for (const role of ["admin", "workshop", "superadmin", "viewer"] as const) {
      const u = await prisma.user.create({
        data: { name: `it-lsb-${role}-${stamp}@anvi.test`, role, password: hashPassword("x") },
      });
      users[role] = { id: u.id, token: await createSession(u.id) };
    }
    const dealer = await prisma.user.create({
      data: {
        name: `it-lsb-dealer-${stamp}@anvi.test`,
        role: "customer",
        password: hashPassword("x"),
        studioCustomerId: customer.id,
      },
    });
    dealerToken = await createSession(dealer.id);
    users.dealer = { id: dealer.id, token: dealerToken };
  });

  afterAll(async () => {
    await prisma.order.deleteMany({
      where: { OR: [{ clientId: dealerCustomerId }, { phone }, { id: { in: createdIds } }] },
    });
    await cleanupTestMugs([mugId]);
    await cleanupTestNotebook(notebookId);
    await cleanupTestLfMaterial(lf);
    await prisma.user.deleteMany({ where: { id: { in: Object.values(users).map((u) => u.id) } } });
    await prisma.studioCustomer.deleteMany({ where: { id: dealerCustomerId } });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    cookieJar.customer = null;
    cookieJar.admin = null;
  });
  afterEach(() => vi.unstubAllGlobals());

  // ─── Helpers ─────────────────────────────────────────────────────────────

  /** The 3-line order from the brief: mug (.1/3) + notebook (.2/3) + banner (.3/3), SENT_TO_WORKSHOP. */
  async function threeLineOrder(): Promise<{ id: string; orderNumber: number; mug: string; notebook: string; banner: string }> {
    cookieJar.admin = users.admin.token;
    const res = await createAdminOrder(
      req("/api/admin/orders", "POST", {
        phone,
        lines: [
          {
            productType: "mug",
            mugProductId: mugId,
            mugLayoutData: layout,
            files: [{ fileName: "mug.png", fileUrl: `uploads/it-lsb/mug-${createdIds.length}.png`, copies: 1, color: "color" }],
          },
          {
            productType: "notebook",
            notebookProductId: notebookId,
            notebookLayoutData: layout,
            files: [{ fileName: "nb.png", fileUrl: `uploads/it-lsb/nb-${createdIds.length}.png`, copies: 1, color: "color" }],
          },
          {
            productType: "large_format_print",
            largeFormatMaterialId: lf.id,
            printWidthCm: 50,
            printHeightCm: 70,
            quantity: 1,
            customerType: "retail",
            files: [{ fileName: "banner.pdf", fileUrl: `uploads/it-lsb/banner-${createdIds.length}.pdf`, copies: 1, color: "color" }],
          },
        ],
      }),
    );
    const body = (await res.json()) as { id: string; orderNumber: number; status: string };
    expect(res.status, JSON.stringify(body)).toBe(201);
    expect(body.status).toBe("SENT_TO_WORKSHOP");
    cookieJar.admin = null;
    createdIds.push(body.id);
    const ls = await lines(body.id);
    expect(ls.map((l) => l.productType)).toEqual(["mug", "notebook", "large_format_print"]);
    return { id: body.id, orderNumber: body.orderNumber, mug: ls[0]!.id, notebook: ls[1]!.id, banner: ls[2]!.id };
  }

  async function lines(orderId: string) {
    return prisma.orderLine.findMany({
      where: { orderId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, productType: true, productionStatus: true, productionStatusAt: true },
    });
  }

  async function orderRow(orderId: string) {
    return prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { status: true, assignedTo: true, isWorkshop: true, issueReason: true, sentToWorkshopBy: true, isPaid: true, deletedAt: true, cancelledAt: true, source: true },
    });
  }

  async function setLines(
    orderId: string,
    lineIds: string[],
    status: string,
    as: keyof typeof users = "workshop",
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    cookieJar.admin = as === "dealer" ? null : users[as].token;
    cookieJar.customer = as === "dealer" ? dealerToken : null;
    const res = await patchLineStatus(req(`/api/orders/${orderId}/lines/status`, "PATCH", { lineIds, status }), ctx(orderId));
    cookieJar.admin = null;
    cookieJar.customer = null;
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  async function setBoard(items: { orderId: string; lineIds: string[] }[], status: string) {
    cookieJar.admin = users.workshop.token;
    const res = await patchBoardLineStatus(req(`/api/workshop-board/line-status`, "PATCH", { items, status }));
    cookieJar.admin = null;
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  async function setOrderStatus(orderId: string, status: OrderStatus, extra: Record<string, unknown> = {}) {
    cookieJar.admin = users.admin.token;
    const res = await patchOrder(req(`/api/orders/${orderId}`, "PATCH", { status, ...extra }), ctx(orderId));
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);
    cookieJar.admin = null;
  }

  /** Order status + every line, and the invariant check for this order. */
  async function expectState(orderId: string, orderStatus: string, lineStatuses: string[]) {
    expect((await orderRow(orderId)).status).toBe(orderStatus);
    expect((await lines(orderId)).map((l) => l.productionStatus)).toEqual(lineStatuses);
    expect((await checkLineStatusSync(prisma, { orderIds: [orderId] })).mismatches).toEqual([]);
  }

  async function logs(orderId: string) {
    return prisma.orderLog.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } });
  }

  // ─── Auth and validation ─────────────────────────────────────────────────

  it("staff only: 401 without a staff session (a dealer's cabinet session too), 403 for a non-staff role", async () => {
    const o = await threeLineOrder();
    const anon = await patchLineStatus(req(`/x`, "PATCH", { lineIds: [o.mug], status: "PRINTING" }), ctx(o.id));
    expect(anon.status).toBe(401);
    expect((await setLines(o.id, [o.mug], "PRINTING", "dealer")).status).toBe(401);
    expect((await setLines(o.id, [o.mug], "PRINTING", "viewer")).status).toBe(403);
    cookieJar.admin = users.viewer.token;
    const board = await patchBoardLineStatus(req(`/x`, "PATCH", { items: [{ orderId: o.id, lineIds: [o.mug] }], status: "PRINTING" }));
    expect(board.status).toBe(403);
    await expectState(o.id, "SENT_TO_WORKSHOP", ["WAITING", "WAITING", "WAITING"]);

    for (const role of ["admin", "workshop", "superadmin"] as const) {
      const r = await setLines(o.id, [o.mug], role === "superadmin" ? "WAITING" : "PRINTING", role);
      expect(r.status, `${role}: ${JSON.stringify(r.body)}`).toBe(200);
    }
    await expectState(o.id, "SENT_TO_WORKSHOP", ["WAITING", "WAITING", "WAITING"]);
  });

  it("validation: unknown / reserved status, empty list, bad JSON → 400, nothing written", async () => {
    const o = await threeLineOrder();
    expect((await setLines(o.id, [o.mug], "NEEDS_LAYOUT")).status).toBe(400);
    expect((await setLines(o.id, [o.mug], "WORKSHOP_PRINTING")).status).toBe(400);
    expect((await setLines(o.id, [], "PRINTING")).status).toBe(400);
    cookieJar.admin = users.workshop.token;
    const bad = await patchLineStatus(req(`/x`, "PATCH", "{not json"), ctx(o.id));
    expect(bad.status).toBe(400);
    await expectState(o.id, "SENT_TO_WORKSHOP", ["WAITING", "WAITING", "WAITING"]);
  });

  it("a line of another order is rejected (400 line_not_in_order); the board call is all-or-nothing", async () => {
    const a = await threeLineOrder();
    const b = await threeLineOrder();
    const r = await setLines(a.id, [a.mug, b.banner], "PRINTING");
    expect(r).toMatchObject({ status: 400, body: { error: "line_not_in_order", orderId: a.id } });
    const nope = await setLines(a.id, ["00000000-0000-0000-0000-000000000000"], "PRINTING");
    expect(nope).toMatchObject({ status: 400, body: { error: "line_not_in_order" } });

    // Board: a valid item for `a` plus `b`'s banner listed under `a` → nothing at all changes.
    const board = await setBoard(
      [
        { orderId: b.id, lineIds: [b.mug] },
        { orderId: a.id, lineIds: [b.banner] },
      ],
      "PRINTING",
    );
    expect(board).toMatchObject({ status: 400, body: { error: "line_not_in_order", orderId: a.id } });
    await expectState(a.id, "SENT_TO_WORKSHOP", ["WAITING", "WAITING", "WAITING"]);
    await expectState(b.id, "SENT_TO_WORKSHOP", ["WAITING", "WAITING", "WAITING"]);
    const unknownOrder = await setBoard([{ orderId: "00000000-0000-0000-0000-000000000000", lineIds: [a.mug] }], "DONE");
    expect(unknownOrder).toMatchObject({ status: 404, body: { error: "order_not_found" } });
  });

  it("wrong phase: studio, finished and ISSUE orders reject line changes (409); a trashed order is 404", async () => {
    const o = await threeLineOrder();
    for (const [status, lineStatuses] of [
      ["IN_PROGRESS", ["WAITING", "WAITING", "WAITING"]],
      ["READY_IN_STUDIO", ["DONE", "DONE", "DONE"]],
      ["RETURNED_TO_STUDIO", ["DONE", "DONE", "DONE"]],
      ["DELIVERED", ["DONE", "DONE", "DONE"]],
      ["NEW", ["WAITING", "WAITING", "WAITING"]],
    ] as const) {
      await setOrderStatus(o.id, status);
      const r = await setLines(o.id, [o.banner], "PRINTING");
      expect(r, status).toMatchObject({ status: 409, body: { error: "wrong_phase" } });
      await expectState(o.id, status, [...lineStatuses]);
    }
    await setOrderStatus(o.id, "SENT_TO_WORKSHOP");
    await setLines(o.id, [o.banner], "PRINTING");
    await setOrderStatus(o.id, "ISSUE", { issueReason: "плёнка кончилась" });
    expect(await setLines(o.id, [o.mug], "DONE")).toMatchObject({ status: 409, body: { error: "wrong_phase" } });
    // ISSUE keeps the lines (step 1).
    expect((await lines(o.id)).map((l) => l.productionStatus)).toEqual(["WAITING", "WAITING", "PRINTING"]);

    await setOrderStatus(o.id, "SENT_TO_WORKSHOP");
    cookieJar.admin = users.admin.token;
    expect((await trashOrder(req(`/x`, "DELETE"), ctx(o.id))).status).toBe(200);
    expect(await setLines(o.id, [o.mug], "PRINTING")).toMatchObject({ status: 404, body: { error: "order_not_found" } });
  });

  // ─── Derivation, side effects, logs ─────────────────────────────────────

  it("the brief's walk: banner printing leaves mug + notebook waiting; order status follows the lines", async () => {
    const o = await threeLineOrder();
    const sender = (await orderRow(o.id)).sentToWorkshopBy;

    // 1. Banner «Печатается» → order WORKSHOP_PRINTING, mug + notebook still waiting.
    const r1 = await setLines(o.id, [o.banner], "PRINTING");
    expect(r1.status).toBe(200);
    expect(r1.body.orders).toEqual([
      expect.objectContaining({
        orderId: o.id,
        changedLineIds: [o.banner],
        oldOrderStatus: "SENT_TO_WORKSHOP",
        newOrderStatus: "WORKSHOP_PRINTING",
      }),
    ]);
    await expectState(o.id, "WORKSHOP_PRINTING", ["WAITING", "WAITING", "PRINTING"]);
    const after1 = await orderRow(o.id);
    expect(after1).toMatchObject({ assignedTo: users.workshop.id, isWorkshop: true, issueReason: null, sentToWorkshopBy: sender });
    const ls1 = await lines(o.id);
    expect(ls1[2]!.productionStatusAt).toBeInstanceOf(Date);
    expect(ls1[0]!.productionStatusAt).toBeNull();

    // 2. Banner done, the rest waiting → still printing (DONE + WAITING mix).
    await setLines(o.id, [o.banner], "DONE");
    await expectState(o.id, "WORKSHOP_PRINTING", ["WAITING", "WAITING", "DONE"]);

    // 3. Mug + notebook printing through the board endpoint.
    const b = await setBoard([{ orderId: o.id, lineIds: [o.mug, o.notebook] }], "PRINTING");
    expect(b.status).toBe(200);
    await expectState(o.id, "WORKSHOP_PRINTING", ["PRINTING", "PRINTING", "DONE"]);

    // 4. Everything done → WORKSHOP_READY.
    await setLines(o.id, [o.mug, o.notebook, o.banner], "DONE");
    await expectState(o.id, "WORKSHOP_READY", ["DONE", "DONE", "DONE"]);

    // 5. Undo one → printing again; all back to waiting → SENT_TO_WORKSHOP.
    await setLines(o.id, [o.notebook], "PRINTING");
    await expectState(o.id, "WORKSHOP_PRINTING", ["DONE", "PRINTING", "DONE"]);
    await setLines(o.id, [o.mug, o.notebook, o.banner], "WAITING");
    await expectState(o.id, "SENT_TO_WORKSHOP", ["WAITING", "WAITING", "WAITING"]);
    // Going back to SENT_TO_WORKSHOP is not a new hand-over.
    expect((await orderRow(o.id)).sentToWorkshopBy).toBe(sender);
  });

  it("logs: one line_status_changed per changed line with its code, a derived status_changed; no-ops write nothing", async () => {
    const o = await threeLineOrder();
    const before = (await logs(o.id)).length;
    await setLines(o.id, [o.banner], "PRINTING");
    const code = (i: number) => `#${String(o.orderNumber).padStart(4, "0")}.${i}/3`;
    const l1 = (await logs(o.id)).slice(before);
    expect(l1.map((l) => [l.action, l.field, l.oldValue, l.newValue, l.userId])).toEqual(
      expect.arrayContaining([
        ["line_status_changed", "productionStatus", "WAITING", "PRINTING", users.workshop.id],
        ["status_changed", "status", "SENT_TO_WORKSHOP", "WORKSHOP_PRINTING", users.workshop.id],
      ]),
    );
    expect(l1).toHaveLength(2);
    expect(l1.find((l) => l.action === "line_status_changed")!.metadata).toEqual({ orderLineId: o.banner, lineCode: code(3) });
    expect(l1.find((l) => l.action === "status_changed")!.metadata).toEqual({ derived: true });

    // Mug printing too: a line entry, but the order status does not change → no status entry.
    await setLines(o.id, [o.mug], "PRINTING");
    const l2 = (await logs(o.id)).slice(before + 2);
    expect(l2.map((l) => [l.action, (l.metadata as { lineCode?: string } | null)?.lineCode])).toEqual([
      ["line_status_changed", code(1)],
    ]);

    // Same status again: nothing written, assignedTo untouched.
    const assigned = (await orderRow(o.id)).assignedTo;
    const again = await setLines(o.id, [o.mug, o.banner], "PRINTING", "admin");
    expect(again.status).toBe(200);
    expect((again.body.orders as { changedLineIds: string[] }[])[0]!.changedLineIds).toEqual([]);
    expect((await logs(o.id)).length).toBe(before + 3);
    expect((await orderRow(o.id)).assignedTo).toBe(assigned);
  });

  it("order-level PATCH keeps step-1 behaviour: every line follows the chosen status", async () => {
    const o = await threeLineOrder();
    await setLines(o.id, [o.banner], "DONE");
    await expectState(o.id, "WORKSHOP_PRINTING", ["WAITING", "WAITING", "DONE"]);
    await setOrderStatus(o.id, "WORKSHOP_READY");
    await expectState(o.id, "WORKSHOP_READY", ["DONE", "DONE", "DONE"]);
    await setOrderStatus(o.id, "SENT_TO_WORKSHOP");
    await expectState(o.id, "SENT_TO_WORKSHOP", ["WAITING", "WAITING", "WAITING"]);
    await setLines(o.id, [o.mug], "PRINTING");
    await setOrderStatus(o.id, "WORKSHOP_PRINTING");
    await expectState(o.id, "WORKSHOP_PRINTING", ["PRINTING", "PRINTING", "PRINTING"]);
    await setOrderStatus(o.id, "RETURNED_TO_STUDIO");
    await expectState(o.id, "RETURNED_TO_STUDIO", ["DONE", "DONE", "DONE"]);
  });

  it("admin edit in the workshop phase re-derives: dropping the only waiting line makes the order ready", async () => {
    const o = await threeLineOrder();
    await setLines(o.id, [o.mug, o.notebook], "DONE");
    await expectState(o.id, "WORKSHOP_PRINTING", ["DONE", "DONE", "WAITING"]);
    const before = await prisma.order.findUniqueOrThrow({
      where: { id: o.id },
      include: { orderLines: { orderBy: { sortOrder: "asc" }, include: { files: true } } },
    });
    const [mug, nb] = before.orderLines;
    cookieJar.admin = users.admin.token;
    const res = await patchAdminOrder(
      req(`/api/admin/orders/${o.id}`, "PATCH", {
        phone,
        lines: [
          { orderLineId: mug!.id, productType: "mug", mugProductId: mugId, mugLayoutData: layout, files: [{ fileId: mug!.files[0]!.id, copies: 1 }] },
          {
            orderLineId: nb!.id,
            productType: "notebook",
            notebookProductId: notebookId,
            notebookLayoutData: layout,
            files: [{ fileId: nb!.files[0]!.id, copies: 1 }],
          },
        ],
      }),
      ctx(o.id),
    );
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);
    await expectState(o.id, "WORKSHOP_READY", ["DONE", "DONE"]);
    const last = (await logs(o.id)).filter((l) => l.action === "status_changed").at(-1)!;
    expect([last.oldValue, last.newValue, last.metadata]).toEqual(["WORKSHOP_PRINTING", "WORKSHOP_READY", { derived: true }]);
  });

  // ─── Dealer lock follows the derived status ─────────────────────────────

  it("dealer lock: editable while every line waits; locked once any line prints or is done; open again when all wait", async () => {
    cookieJar.customer = dealerToken;
    const res = await createCabinetOrder(
      req("/api/cabinet/orders", "POST", {
        lines: [
          { productType: "mug", mugProductId: mugId, mugLayoutData: layout, files: [{ fileName: "d1.png", fileUrl: "uploads/it-lsb/d1.png", copies: 1, color: "color" }] },
          {
            productType: "notebook",
            notebookProductId: notebookId,
            notebookLayoutData: layout,
            files: [{ fileName: "d2.png", fileUrl: "uploads/it-lsb/d2.png", copies: 1, color: "color" }],
          },
        ],
      }),
    );
    const created = (await res.json()) as { id: string };
    expect(res.status, JSON.stringify(created)).toBe(201);
    cookieJar.customer = null;
    const id = created.id;
    const ls = await lines(id);

    const tryEdit = async (notes: string) => {
      const o = await prisma.order.findUniqueOrThrow({
        where: { id },
        include: { orderLines: { orderBy: { sortOrder: "asc" }, include: { files: true } } },
      });
      cookieJar.customer = dealerToken;
      const put = await putCabinetOrder(
        req(`/api/cabinet/orders/${id}`, "PUT", {
          notes,
          lines: [
            { orderLineId: o.orderLines[0]!.id, productType: "mug", mugProductId: mugId, files: [{ fileId: o.orderLines[0]!.files[0]!.id, copies: 1 }] },
            {
              orderLineId: o.orderLines[1]!.id,
              productType: "notebook",
              notebookProductId: notebookId,
              files: [{ fileId: o.orderLines[1]!.files[0]!.id, copies: 1 }],
            },
          ],
        }),
        ctx(id),
      );
      cookieJar.customer = null;
      return put;
    };

    // All waiting → SENT_TO_WORKSHOP → editable.
    await setLines(id, [ls[0]!.id], "WAITING");
    expect(canDealerModifyOrder(await orderRow(id))).toBe(true);
    expect((await tryEdit("all waiting")).status).toBe(200);

    // One line printing → derived WORKSHOP_PRINTING → locked.
    await setLines(id, [ls[0]!.id], "PRINTING");
    const printing = await orderRow(id);
    expect(printing.status).toBe("WORKSHOP_PRINTING");
    expect(canDealerModifyOrder(printing)).toBe(false);
    expect(dealerOrderActionsState(printing)).toBe("locked");
    const locked = await tryEdit("late");
    expect(locked.status).toBe(409);
    expect(await locked.json()).toMatchObject({ code: "order_locked" });

    // One done, one waiting → still printing → still locked.
    await setLines(id, [ls[0]!.id], "DONE");
    expect((await orderRow(id)).status).toBe("WORKSHOP_PRINTING");
    expect((await tryEdit("late 2")).status).toBe(409);

    // All done → WORKSHOP_READY → finished for the dealer (hidden), not editable.
    await setLines(id, [ls[1]!.id], "DONE");
    const ready = await orderRow(id);
    expect(ready.status).toBe("WORKSHOP_READY");
    expect(canDealerModifyOrder(ready)).toBe(false);

    // The workshop un-marks everything → SENT_TO_WORKSHOP → editable again.
    await setLines(id, [ls[0]!.id, ls[1]!.id], "WAITING");
    expect(canDealerModifyOrder(await orderRow(id))).toBe(true);
    expect((await tryEdit("open again")).status).toBe(200);
    await expectState(id, "SENT_TO_WORKSHOP", ["WAITING", "WAITING"]);
  });

  // ─── Board data + batch runners ─────────────────────────────────────────

  /** Route the runners' browser `fetch` to the in-process handlers, as the workshop user. */
  function stubFetchToRoutes(): { url: string; body: unknown }[] {
    const calls: { url: string; body: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, body: JSON.parse(String(init.body)) });
        cookieJar.admin = users.workshop.token;
        const m = /^\/api\/orders\/([^/]+)\/lines\/status$/.exec(url);
        if (m) return patchLineStatus(req(url, "PATCH", JSON.parse(String(init.body))), ctx(m[1]!));
        const o = /^\/api\/orders\/([^/]+)$/.exec(url);
        if (o) return patchOrder(req(url, "PATCH", JSON.parse(String(init.body))), ctx(o[1]!));
        throw new Error(`unexpected fetch ${url}`);
      }),
    );
    return calls;
  }

  it("board: each line shows its own status; the mug batch includes a mug whose order's banner prints, and marks only it", async () => {
    const o = await threeLineOrder();
    const other = await threeLineOrder();
    await setLines(o.id, [o.banner], "PRINTING");
    await setLines(other.id, [other.mug], "PRINTING");

    const board = await fetchWorkshopBoardData(
      { id: users.workshop.id, name: "w", role: "workshop" },
      { search: String(o.orderNumber) },
    );
    const all = board.sections.flatMap((s) => s.groups.flatMap((g) => g.lines)).filter((l) => l.orderId === o.id);
    expect(Object.fromEntries(all.map((l) => [l.productType, [l.status, l.lineStatus]]))).toEqual({
      mug: ["WORKSHOP_PRINTING", "WAITING"],
      notebook: ["WORKSHOP_PRINTING", "WAITING"],
      large_format_print: ["WORKSHOP_PRINTING", "PRINTING"],
    });

    const full = await fetchWorkshopBoardData({ id: users.workshop.id, name: "w", role: "workshop" }, { search: phone });
    const mugSection = full.sections.find((s) => s.productType === "mug")!;
    const fresh = filterMugTilesReadyForBatch(flattenMugSectionTiles(mugSection), mugLineStatusSnapshot(mugSection));
    const freshLines = new Set(fresh.map((t) => t.orderLineId));
    expect(freshLines.has(o.mug)).toBe(true); // order WORKSHOP_PRINTING, its mug still waits
    expect(freshLines.has(other.mug)).toBe(false); // already printing

    // Stage 3 of runMugSectionBatch: only the batched mug lines change.
    const calls = stubFetchToRoutes();
    const batch = fresh.filter((t) => t.orderId === o.id || t.orderId === other.id);
    const res = await markLinesPrinting(batch);
    expect(res).toEqual({ updated: 1, failed: 0 });
    expect(calls).toEqual([{ url: `/api/orders/${o.id}/lines/status`, body: { lineIds: [o.mug], status: "PRINTING" } }]);
    await expectState(o.id, "WORKSHOP_PRINTING", ["PRINTING", "WAITING", "PRINTING"]);
    await expectState(other.id, "WORKSHOP_PRINTING", ["PRINTING", "WAITING", "WAITING"]);
  });

  it("notebook batch: selects waiting notebook lines by line status and marks only them", async () => {
    const o = await threeLineOrder();
    const o2 = await threeLineOrder();
    await setLines(o.id, [o.banner, o.mug], "DONE");
    const full = await fetchWorkshopBoardData({ id: users.workshop.id, name: "w", role: "workshop" }, { search: phone });
    const nbSection = full.sections.find((s) => s.productType === "notebook")!;
    const fresh = filterTilesReadyForBatch(flattenNotebookSectionTiles(nbSection), notebookLineStatusSnapshot(nbSection)).filter(
      (t) => t.orderId === o.id || t.orderId === o2.id,
    );
    expect(fresh.map((t) => t.orderLineId).sort()).toEqual([o.notebook, o2.notebook].sort());
    stubFetchToRoutes();
    expect(await markLinesPrinting(fresh)).toEqual({ updated: 2, failed: 0 });
    await expectState(o.id, "WORKSHOP_PRINTING", ["DONE", "PRINTING", "DONE"]);
    await expectState(o2.id, "WORKSHOP_PRINTING", ["WAITING", "PRINTING", "WAITING"]);
    // Finishing the notebook completes order 1.
    await setLines(o.id, [o.notebook], "DONE");
    await expectState(o.id, "WORKSHOP_READY", ["DONE", "DONE", "DONE"]);
  });

  it("business-card style download on the board: marking one line PRINTING leaves the rest", async () => {
    // The board's «Скачать макет» calls the same per-line endpoint with only that line.
    const o = await threeLineOrder();
    stubFetchToRoutes();
    const r = await fetch(`/api/orders/${o.id}/lines/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineIds: [o.notebook], status: "PRINTING" }),
    });
    expect(r.status).toBe(200);
    await expectState(o.id, "WORKSHOP_PRINTING", ["WAITING", "PRINTING", "WAITING"]);
  });

  it("all orders this suite touched pass the invariant check", async () => {
    const res = await checkLineStatusSync(prisma, { orderIds: createdIds });
    expect(res.ordersChecked).toBeGreaterThan(5);
    expect(res.ordersDerived).toBeGreaterThan(0);
    expect(res.mismatches).toEqual([]);
  });
});
