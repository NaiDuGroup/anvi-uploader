/**
 * Per-line production status, step 1: every write of `Order.status` keeps the
 * lines' `productionStatus` = `lineStatusForOrderStatus(order.status)` (ISSUE
 * keeps them), new lines inherit the order's status, and nothing else changes.
 *
 * Route handlers run in-process with real sessions against a LOCAL database
 * (refuses any other DATABASE_URL). Run with
 * `npx vitest run --config vitest.integration.config.ts tests/integration/line-production-status.test.ts`.
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
import { PATCH as patchMugLayout } from "@/app/api/admin/orders/[id]/mug-layout/route";
import { PATCH as patchNotebookLayout } from "@/app/api/admin/orders/[id]/notebook-layout/route";
import { POST as createPublicOrder } from "@/app/api/orders/route";
import { PATCH as patchOrder, DELETE as trashOrder } from "@/app/api/orders/[id]/route";
import { POST as restoreOrder } from "@/app/api/orders/[id]/restore/route";
import { POST as approveOrder } from "@/app/api/approve/[token]/route";
import { POST as createCabinetOrder } from "@/app/api/cabinet/orders/route";
import { PUT as putCabinetOrder } from "@/app/api/cabinet/orders/[id]/route";
import { POST as cancelCabinetOrder } from "@/app/api/cabinet/orders/[id]/cancel/route";
import { createOrderWithResolvedLines, resolveOrderLines } from "@/lib/orderCreate/orderLines";
import { canDealerModifyOrder } from "@/lib/dealerOrderModify";
import { lineStatusForOrderStatus } from "@/lib/orderLineProductionStatus";
import { checkLineStatusSync } from "@/lib/orderLineStatusCheck";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/validations";
import { cleanupTestMugs, createTestMug } from "./mugSeed";
import { cleanupTestNotebook, createTestNotebook } from "./notebookSeed";

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
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

const stamp = `${Date.now()}`.slice(-7);
const paperFile = (name: string) => ({
  fileName: `${name}.pdf`,
  fileUrl: `uploads/1700000000000-itTestK0-line-${name}`,
  copies: 1,
  color: "bw",
  paperType: "A4",
  pageCount: 1,
});

async function lines(orderId: string) {
  return prisma.orderLine.findMany({
    where: { orderId },
    orderBy: { sortOrder: "asc" },
    select: { id: true, productType: true, productionStatus: true, productionStatusAt: true },
  });
}

/** Every line of the order has the mapped status of `status` (and the order is that status). */
async function expectLinesFollow(orderId: string, status: OrderStatus) {
  const o = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } });
  expect(o.status).toBe(status);
  const ls = await lines(orderId);
  expect(ls.length).toBeGreaterThan(0);
  expect(ls.map((l) => l.productionStatus)).toEqual(ls.map(() => lineStatusForOrderStatus(status)));
  const check = await checkLineStatusSync(prisma, { orderIds: [orderId] });
  expect(check.mismatches).toEqual([]);
  return ls;
}

describe.skipIf(!isLocalDb)("integration: per-line production status stays in sync (step 1)", () => {
  let mugId: string;
  let notebookId: string;
  let dealerCustomerId: string;
  let dealerUserId: string;
  let dealerToken: string;
  let staffId: string;
  let staffToken: string;
  const phone = `+3734${stamp}1`;
  const createdIds: string[] = [];

  beforeAll(async () => {
    mugId = (await createTestMug(200, { sellPrice: 100, skuPrefix: "IT-LINE-ST" })).id;
    notebookId = (await createTestNotebook(200, "IT-LINE-NB")).id;
    const customer = await prisma.studioCustomer.create({
      data: { kind: "INDIVIDUAL", phone: `+3734${stamp}2`, personName: `IT line ${stamp}`, isDealer: true },
    });
    dealerCustomerId = customer.id;
    const dealer = await prisma.user.create({
      data: { name: `it-line-dealer-${stamp}@anvi.test`, role: "customer", password: hashPassword("x"), studioCustomerId: customer.id },
    });
    dealerUserId = dealer.id;
    dealerToken = await createSession(dealer.id);
    const staff = await prisma.user.create({
      data: { name: `it-line-staff-${stamp}@anvi.test`, role: "admin", password: hashPassword("x") },
    });
    staffId = staff.id;
    staffToken = await createSession(staff.id);
  });

  afterAll(async () => {
    await prisma.order.deleteMany({
      where: { OR: [{ clientId: dealerCustomerId }, { phone }, { id: { in: createdIds } }] },
    });
    await cleanupTestMugs([mugId]);
    await cleanupTestNotebook(notebookId);
    await prisma.user.deleteMany({ where: { id: { in: [dealerUserId, staffId] } } });
    await prisma.studioCustomer.deleteMany({ where: { id: dealerCustomerId } });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    cookieJar.customer = null;
    cookieJar.admin = null;
  });

  /** Staff wizard order: paper + mug (+ notebook), created through the real admin POST. */
  async function adminOrder(withNotebook = false): Promise<string> {
    cookieJar.admin = staffToken;
    const res = await createAdminOrder(
      req("/api/admin/orders", "POST", {
        phone,
        lines: [
          { productType: "paper_print", files: [paperFile(`a-${createdIds.length}`)] },
          {
            productType: "mug",
            mugProductId: mugId,
            mugLayoutData: layout,
            files: [{ fileName: "mug.png", fileUrl: "uploads/it-line/mug.png", copies: 1, color: "color" }],
          },
          ...(withNotebook
            ? [
                {
                  productType: "notebook",
                  notebookProductId: notebookId,
                  notebookLayoutData: layout,
                  files: [{ fileName: "nb.png", fileUrl: "uploads/it-line/nb.png", copies: 1, color: "color" }],
                },
              ]
            : []),
        ],
      }),
    );
    const body = (await res.json()) as { id: string };
    expect(res.status, JSON.stringify(body)).toBe(201);
    cookieJar.admin = null;
    createdIds.push(body.id);
    return body.id;
  }

  async function setStatus(orderId: string, status: OrderStatus, extra: Record<string, unknown> = {}) {
    cookieJar.admin = staffToken;
    const res = await patchOrder(req(`/api/orders/${orderId}`, "PATCH", { status, ...extra }), ctx(orderId));
    const body = (await res.json()) as { status: string; orderLines: { productionStatus: string }[] };
    expect(res.status, JSON.stringify(body)).toBe(200);
    cookieJar.admin = null;
    return body;
  }

  /** Simulate drift (a line out of sync) so a sync write is visible even when the mapping would not move it. */
  async function corruptLines(orderId: string, productionStatus: string) {
    await prisma.orderLine.updateMany({ where: { orderId }, data: { productionStatus } });
  }

  // ─── Create paths ────────────────────────────────────────────────────────

  it("admin create: SENT_TO_WORKSHOP, every line WAITING with no timestamp", async () => {
    const id = await adminOrder(true);
    const ls = await expectLinesFollow(id, "SENT_TO_WORKSHOP");
    expect(ls).toHaveLength(3);
    expect(ls.every((l) => l.productionStatusAt === null)).toBe(true);
  });

  it("cabinet dealer create: SENT_TO_WORKSHOP, lines WAITING", async () => {
    cookieJar.customer = dealerToken;
    const res = await createCabinetOrder(
      req("/api/cabinet/orders", "POST", {
        lines: [
          {
            productType: "mug",
            mugProductId: mugId,
            mugLayoutData: layout,
            files: [{ fileName: "d.png", fileUrl: "uploads/it-line/d.png", copies: 2, color: "color" }],
          },
        ],
      }),
    );
    const body = (await res.json()) as { id: string };
    expect(res.status, JSON.stringify(body)).toBe(201);
    await expectLinesFollow(body.id, "SENT_TO_WORKSHOP");
  });

  it("public POST /api/orders (guest): NEW, lines WAITING", async () => {
    const res = await createPublicOrder(
      req("/api/orders", "POST", { phone, notes: "it line guest", files: [paperFile("guest")] }),
    );
    const body = (await res.json()) as { id: string };
    expect(res.status, JSON.stringify(body)).toBe(201);
    createdIds.push(body.id);
    await expectLinesFollow(body.id, "NEW");
  });

  it("shared create (shop checkout / cabinet / admin): lines inherit a non-default order status", async () => {
    const { resolved } = await resolveOrderLines([
      { productType: "paper_print", files: [paperFile("shared-1")] },
      { productType: "paper_print", files: [paperFile("shared-2")] },
    ] as Parameters<typeof resolveOrderLines>[0]);
    for (const status of ["WORKSHOP_PRINTING", "DELIVERED", "NEW"] as const) {
      const o = await createOrderWithResolvedLines({
        order: {
          phone,
          productType: "paper_print",
          status,
          publicToken: `it-line-${stamp}-${status}`,
          expiresAt: new Date(Date.now() + 86_400_000),
        },
        resolved,
        actorId: staffId,
        skipStock: true,
      });
      createdIds.push(o.id);
      await expectLinesFollow(o.id, status);
    }
  });

  // ─── PATCH /api/orders/[id] ─────────────────────────────────────────────

  it("PATCH: every status moves all lines to the mapped status, in the response too", async () => {
    const id = await adminOrder(true);
    const walk: OrderStatus[] = [
      "IN_PROGRESS",
      "SENT_TO_WORKSHOP",
      "WORKSHOP_PRINTING",
      "WORKSHOP_READY",
      "RETURNED_TO_STUDIO",
      "READY_IN_STUDIO",
      "DELIVERED",
      "NEW",
      "WORKSHOP_PRINTING",
    ];
    expect(new Set(walk)).toEqual(new Set(ORDER_STATUSES.filter((s) => s !== "ISSUE")));
    for (const status of walk) {
      const body = await setStatus(id, status);
      expect(body.status).toBe(status);
      expect(body.orderLines.map((l) => l.productionStatus)).toEqual(
        body.orderLines.map(() => lineStatusForOrderStatus(status)),
      );
      await expectLinesFollow(id, status);
    }
  });

  it("PATCH: productionStatusAt moves only when a line's status changes", async () => {
    const id = await adminOrder();
    await setStatus(id, "IN_PROGRESS");
    expect((await lines(id)).every((l) => l.productionStatusAt === null)).toBe(true);
    await setStatus(id, "WORKSHOP_PRINTING");
    const printing = await lines(id);
    expect(printing.every((l) => l.productionStatusAt instanceof Date)).toBe(true);
    // Same mapped status (READY → RETURNED are both DONE): timestamps of the first move stay.
    await setStatus(id, "WORKSHOP_READY");
    const ready = await lines(id);
    await setStatus(id, "RETURNED_TO_STUDIO");
    expect((await lines(id)).map((l) => l.productionStatusAt?.getTime())).toEqual(
      ready.map((l) => l.productionStatusAt?.getTime()),
    );
    // A PATCH without status leaves the lines alone.
    cookieJar.admin = staffToken;
    const prio = await patchOrder(req(`/x`, "PATCH", { isPrio: true }), ctx(id));
    expect(prio.status).toBe(200);
    await corruptLines(id, "PRINTING");
    const prio2 = await patchOrder(req(`/x`, "PATCH", { isPrio: false }), ctx(id));
    expect(prio2.status).toBe(200);
    expect((await lines(id)).map((l) => l.productionStatus)).toEqual(["PRINTING", "PRINTING"]);
    // The next status write heals them.
    await setStatus(id, "DELIVERED");
    await expectLinesFollow(id, "DELIVERED");
  });

  it("PATCH to ISSUE keeps the lines; leaving ISSUE maps them again", async () => {
    const id = await adminOrder();
    await setStatus(id, "WORKSHOP_PRINTING");
    const before = await lines(id);
    await setStatus(id, "ISSUE", { issueReason: "ink ran out" });
    const during = await lines(id);
    expect(during.map((l) => l.productionStatus)).toEqual(["PRINTING", "PRINTING"]);
    expect(during.map((l) => l.productionStatusAt?.getTime())).toEqual(before.map((l) => l.productionStatusAt?.getTime()));
    // The invariant check skips ISSUE orders.
    const check = await checkLineStatusSync(prisma, { orderIds: [id] });
    expect(check).toMatchObject({ ordersChecked: 0, ordersSkipped: 1, mismatches: [] });

    await setStatus(id, "WORKSHOP_READY");
    await expectLinesFollow(id, "WORKSHOP_READY");
    await setStatus(id, "ISSUE", { issueReason: "client complaint" });
    expect((await lines(id)).map((l) => l.productionStatus)).toEqual(["DONE", "DONE"]);
    await setStatus(id, "IN_PROGRESS");
    await expectLinesFollow(id, "IN_PROGRESS");
  });

  // ─── Admin edit adds lines ──────────────────────────────────────────────

  it("admin edit: a line added to a printing order starts PRINTING, kept lines untouched", async () => {
    const id = await adminOrder();
    await setStatus(id, "WORKSHOP_PRINTING");
    const before = await prisma.order.findUniqueOrThrow({
      where: { id },
      include: { orderLines: { orderBy: { sortOrder: "asc" }, include: { files: true } } },
    });
    const [paper, mug] = before.orderLines;
    cookieJar.admin = staffToken;
    const res = await patchAdminOrder(
      req(`/api/admin/orders/${id}`, "PATCH", {
        phone,
        lines: [
          { orderLineId: paper!.id, productType: "paper_print", files: [{ fileId: paper!.files[0]!.id, copies: 1 }] },
          {
            orderLineId: mug!.id,
            productType: "mug",
            mugProductId: mugId,
            mugLayoutData: layout,
            files: [{ fileId: mug!.files[0]!.id, copies: 1 }],
          },
          { productType: "paper_print", files: [paperFile("added")] },
        ],
      }),
      ctx(id),
    );
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);
    const after = await expectLinesFollow(id, "WORKSHOP_PRINTING");
    expect(after).toHaveLength(3);
    expect(after[2]!.productionStatusAt).toBeNull();
    expect(after.slice(0, 2).map((l) => l.productionStatusAt?.getTime())).toEqual(
      (await Promise.resolve(before.orderLines)).map((l) => l.productionStatusAt?.getTime()),
    );
  });

  // ─── Dealer edit / cancel, trash, restore ───────────────────────────────

  async function dealerOrder() {
    cookieJar.customer = dealerToken;
    const res = await createCabinetOrder(
      req("/api/cabinet/orders", "POST", {
        notes: "first",
        lines: [
          {
            productType: "mug",
            mugProductId: mugId,
            mugLayoutData: layout,
            files: [{ fileName: "e.png", fileUrl: "uploads/it-line/e.png", copies: 1, color: "color" }],
          },
        ],
      }),
    );
    const body = (await res.json()) as { id: string };
    expect(res.status, JSON.stringify(body)).toBe(201);
    cookieJar.customer = null;
    return prisma.order.findUniqueOrThrow({
      where: { id: body.id },
      include: { orderLines: { orderBy: { sortOrder: "asc" }, include: { files: true } } },
    });
  }

  it("dealer edit adding a line: still 200, new line WAITING; lock rules unchanged", async () => {
    const order = await dealerOrder();
    const line = order.orderLines[0]!;
    const editBody = {
      notes: "changed",
      lines: [
        { orderLineId: line.id, productType: "mug", mugProductId: mugId, files: [{ fileId: line.files[0]!.id, copies: 2 }] },
        {
          productType: "mug",
          mugProductId: mugId,
          mugLayoutData: layout,
          files: [{ fileName: "f.png", fileUrl: "uploads/it-line/f.png", copies: 1, color: "color" }],
        },
      ],
    };
    cookieJar.customer = dealerToken;
    const put = await putCabinetOrder(req(`/api/cabinet/orders/${order.id}`, "PUT", editBody), ctx(order.id));
    expect(put.status, JSON.stringify(await put.clone().json())).toBe(200);
    const after = await expectLinesFollow(order.id, "SENT_TO_WORKSHOP");
    expect(after).toHaveLength(2);
    const edited = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(edited.notes).toBe("changed");
    expect(edited.dealerEditedAt).toBeInstanceOf(Date);
    expect(canDealerModifyOrder(edited)).toBe(true);

    // Printing started (staff PATCH): lines PRINTING, the dealer is locked out exactly as before.
    await setStatus(order.id, "WORKSHOP_PRINTING");
    await expectLinesFollow(order.id, "WORKSHOP_PRINTING");
    const printing = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { orderLines: { orderBy: { sortOrder: "asc" }, include: { files: true } } },
    });
    expect(canDealerModifyOrder(printing)).toBe(false);
    cookieJar.customer = dealerToken;
    const locked = await putCabinetOrder(
      req(`/x`, "PUT", {
        notes: "late",
        lines: printing.orderLines.map((l) => ({
          orderLineId: l.id,
          productType: "mug",
          mugProductId: mugId,
          files: [{ fileId: l.files[0]!.id, copies: 1 }],
        })),
      }),
      ctx(order.id),
    );
    expect(locked.status).toBe(409);
    expect(await locked.json()).toMatchObject({ code: "order_locked" });
    const cancel = await cancelCabinetOrder(req(`/x`, "POST", { reason: "late" }), ctx(order.id));
    expect(cancel.status).toBe(409);
    await expectLinesFollow(order.id, "WORKSHOP_PRINTING");
  });

  it("dealer cancel keeps line statuses; staff restore leaves them in sync", async () => {
    const order = await dealerOrder();
    const before = await lines(order.id);
    cookieJar.customer = dealerToken;
    const cancel = await cancelCabinetOrder(req(`/x`, "POST", { reason: "changed my mind" }), ctx(order.id));
    expect(cancel.status, JSON.stringify(await cancel.clone().json())).toBe(200);
    const cancelled = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(cancelled.deletedAt).toBeInstanceOf(Date);
    expect(cancelled.cancelledAt).toBeInstanceOf(Date);
    expect(await lines(order.id)).toEqual(before);
    // Soft-deleted orders are checked too.
    await expectLinesFollow(order.id, "SENT_TO_WORKSHOP");

    cookieJar.customer = null;
    cookieJar.admin = staffToken;
    const restored = await restoreOrder(req(`/x`, "POST"), ctx(order.id));
    expect(restored.status, JSON.stringify(await restored.clone().json())).toBe(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).deletedAt).toBeNull();
    expect(await lines(order.id)).toEqual(before);
    await expectLinesFollow(order.id, "SENT_TO_WORKSHOP");
  });

  it("staff trash + restore of a delivered order keeps DONE lines", async () => {
    const id = await adminOrder();
    await setStatus(id, "DELIVERED");
    const before = await lines(id);
    cookieJar.admin = staffToken;
    expect((await trashOrder(req(`/x`, "DELETE"), ctx(id))).status).toBe(200);
    expect(await lines(id)).toEqual(before);
    expect((await restoreOrder(req(`/x`, "POST"), ctx(id))).status).toBe(200);
    expect(await lines(id)).toEqual(before);
    await expectLinesFollow(id, "DELIVERED");
  });

  // ─── Layout save and the approve link ───────────────────────────────────

  async function saveLayout(kind: "mug" | "notebook", orderId: string) {
    cookieJar.admin = staffToken;
    const res =
      kind === "mug"
        ? await patchMugLayout(
            req(`/x`, "PATCH", { mugLayoutData: layout, fileUrl: "uploads/it-line/mug-2.png", fileName: "mug-2.png" }),
            ctx(orderId),
          )
        : await patchNotebookLayout(
            req(`/x`, "PATCH", { notebookLayoutData: layout, fileUrl: "uploads/it-line/nb-2.png", fileName: "nb-2.png" }),
            ctx(orderId),
          );
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);
    cookieJar.admin = null;
  }

  /** Single-product mug / notebook order (the layout routes and the approve link need one). */
  async function singleProductOrder(kind: "mug" | "notebook") {
    cookieJar.customer = dealerToken;
    const line =
      kind === "mug"
        ? { productType: "mug", mugProductId: mugId, mugLayoutData: layout }
        : { productType: "notebook", notebookProductId: notebookId, notebookLayoutData: layout };
    const res = await createCabinetOrder(
      req("/api/cabinet/orders", "POST", {
        lines: [{ ...line, files: [{ fileName: "a.png", fileUrl: `uploads/it-line/${kind}.png`, copies: 1, color: "color" }] }],
      }),
    );
    const body = (await res.json()) as { id: string };
    expect(res.status, JSON.stringify(body)).toBe(201);
    cookieJar.customer = null;
    return body.id;
  }

  for (const kind of ["mug", "notebook"] as const) {
    it(`${kind}-layout: ISSUE (lines DONE) → IN_PROGRESS maps lines to WAITING; printing order keeps PRINTING`, async () => {
      const id = await singleProductOrder(kind);
      await setStatus(id, "WORKSHOP_READY");
      await setStatus(id, "ISSUE", { issueReason: "redo" });
      expect((await lines(id)).map((l) => l.productionStatus)).toEqual(["DONE"]);
      await saveLayout(kind, id);
      await expectLinesFollow(id, "IN_PROGRESS");

      await setStatus(id, "WORKSHOP_PRINTING");
      await saveLayout(kind, id);
      await expectLinesFollow(id, "WORKSHOP_PRINTING");

      // SENT_TO_WORKSHOP rollback to IN_PROGRESS: lines heal to WAITING even after drift.
      await setStatus(id, "SENT_TO_WORKSHOP");
      await corruptLines(id, "DONE");
      await saveLayout(kind, id);
      await expectLinesFollow(id, "IN_PROGRESS");
    });
  }

  it("approve link: IN_PROGRESS → SENT_TO_WORKSHOP, lines synced in the same write", async () => {
    const id = await singleProductOrder("mug");
    await setStatus(id, "IN_PROGRESS", { isWorkshop: false });
    await corruptLines(id, "DONE");
    const o = await prisma.order.findUniqueOrThrow({ where: { id } });
    expect(o.isWorkshop).toBe(false);
    const res = await approveOrder(req(`/x`, "POST", { action: "approve" }), {
      params: Promise.resolve({ token: o.publicToken }),
    });
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);
    await expectLinesFollow(id, "SENT_TO_WORKSHOP");
  });

  it("all orders this suite touched are in sync", async () => {
    const res = await checkLineStatusSync(prisma, { orderIds: createdIds });
    expect(res.mismatches).toEqual([]);
    expect(res.ordersChecked).toBeGreaterThan(0);
  });
});
