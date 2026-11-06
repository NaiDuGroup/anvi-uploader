/**
 * Staff «Заменить файл» on a «Нужен макет» line
 * (`POST /api/orders/[id]/lines/[lineId]/replace-file`): the focused flow of
 * the studio orders list / ЦЕХ sidebar / workshop board. Same core as the
 * cabinet replace (`replaceFlaggedLineFilesInTx`): archive, replace, WAITING +
 * layoutFixedAt, order re-derived, `line_layout_fixed` by staff; plus links.
 *
 * Route handlers run in-process with real sessions against a LOCAL database
 * (refuses any other DATABASE_URL).
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
import { PATCH as patchLineStatus } from "@/app/api/orders/[id]/lines/status/route";
import { DELETE as clearRoute, POST as flagRoute } from "@/app/api/orders/[id]/lines/[lineId]/layout-issue/route";
import { POST as staffReplaceRoute } from "@/app/api/orders/[id]/lines/[lineId]/replace-file/route";
import { GET as getCabinetOrder } from "@/app/api/cabinet/orders/[id]/route";
import { deriveWorkshopOrderStatus } from "@/lib/orderStatusFromLines";
import { checkLineStatusSync } from "@/lib/orderLineStatusCheck";
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

type Party = { customerId: string; userId: string; token: string };

describe.skipIf(!isLocalDb)("integration: staff «Заменить файл» on a «Нужен макет» line", () => {
  let mugId: string;
  let notebookId: string;
  let lf: TestLfMaterial;
  let dealer: Party;
  let retail: Party;
  let stranger: Party;
  const staff: Record<"admin" | "workshop" | "viewer", { id: string; token: string }> = {} as never;
  const phone = `+3736${stamp}1`;
  const createdIds: string[] = [];

  async function makeCustomer(isDealer: boolean, n: number): Promise<Party> {
    const customer = await prisma.studioCustomer.create({
      data: { kind: "INDIVIDUAL", phone: `+3736${stamp}${n + 2}`, personName: `IT lls ${stamp}-${n}`, isDealer },
    });
    const user = await prisma.user.create({
      data: {
        name: `it-lls-c${n}-${stamp}@anvi.test`,
        role: "customer",
        password: hashPassword("x"),
        studioCustomerId: customer.id,
      },
    });
    return { customerId: customer.id, userId: user.id, token: await createSession(user.id) };
  }

  beforeAll(async () => {
    mugId = (await createTestMug(200, { sellPrice: 100, skuPrefix: "IT-LLS" })).id;
    notebookId = (await createTestNotebook(200, "IT-LLS-NB")).id;
    lf = await createTestLfMaterial(`IT LLS BANNER ${stamp}`, { stockLm: 100 });
    dealer = await makeCustomer(true, 1);
    retail = await makeCustomer(false, 2);
    stranger = await makeCustomer(true, 3);
    for (const role of ["admin", "workshop", "viewer"] as const) {
      const u = await prisma.user.create({
        data: { name: `it-lls-${role}-${stamp}@anvi.test`, role, password: hashPassword("x") },
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
          { productType: "mug", mugProductId: mugId, mugLayoutData: layout, files: [{ fileName: "mug-a.png", fileUrl: `uploads/it-lls/mug-a-${n}.png`, copies: 1, color: "color" }] },
          { productType: "mug", mugProductId: mugId, mugLayoutData: layout, files: [{ fileName: "mug-b.png", fileUrl: `uploads/it-lls/mug-b-${n}.png`, copies: 2, color: "color" }] },
          { productType: "notebook", notebookProductId: notebookId, notebookLayoutData: layout, files: [{ fileName: "nb.png", fileUrl: `uploads/it-lls/nb-${n}.png`, copies: 1, color: "color" }] },
          {
            productType: "large_format_print",
            largeFormatMaterialId: lf.id,
            printWidthCm: 50,
            printHeightCm: 70,
            quantity: 1,
            customerType: "retail",
            files: [{ fileName: "banner.pdf", fileUrl: `uploads/it-lls/banner-${n}.pdf`, copies: 1, color: "color" }],
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
  async function setLines(orderId: string, lineIds: string[], status: string): Promise<Res> {
    cookieJar.admin = staff.workshop.token;
    const r = await read(await patchLineStatus(req(`/x`, "PATCH", { lineIds, status }), ctx(orderId)));
    cookieJar.admin = null;
    return r;
  }
  async function cabinetDetail(orderId: string, as: Party): Promise<Res> {
    cookieJar.customer = as.token;
    const r = await read(await getCabinetOrder(req(`/x`, "GET"), ctx(orderId)));
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

  async function staffReplace(orderId: string, lineId: string, body: unknown, as: keyof typeof staff | null = "workshop"): Promise<Res> {
    cookieJar.admin = as ? staff[as].token : null;
    const r = await read(await staffReplaceRoute(req(`/x`, "POST", body), lineCtx(orderId, lineId)));
    cookieJar.admin = null;
    return r;
  }
  const fileBody = (name: string) => ({ files: [{ fileName: name, fileUrl: uploadKey(name) }] });

  it("auth: anonymous 401, a cabinet session 401 (also the owner), a non-staff role 403; workshop and admin OK", async () => {
    const o = await mixedOrder(dealer);
    await flag(o.id, o.mug, { reason: "lowQuality" });
    await flag(o.id, o.mug2, { reason: "lowQuality" });
    expect((await staffReplace(o.id, o.mug, fileBody("a.png"), null)).status).toBe(401);
    cookieJar.customer = dealer.token;
    expect((await staffReplaceRoute(req(`/x`, "POST", fileBody("a.png")), lineCtx(o.id, o.mug))).status).toBe(401);
    cookieJar.customer = null;
    // A cabinet user's session id in the staff cookie is not staff either.
    cookieJar.admin = dealer.token;
    expect([401, 403]).toContain((await staffReplaceRoute(req(`/x`, "POST", fileBody("a.png")), lineCtx(o.id, o.mug))).status);
    cookieJar.admin = null;
    expect((await staffReplace(o.id, o.mug, fileBody("a.png"), "viewer")).status).toBe(403);
    await expectState(o.id, "SENT_TO_WORKSHOP", ["NEEDS_LAYOUT", "NEEDS_LAYOUT", "WAITING", "WAITING"]);
    expect(await prisma.orderFileArchive.count({ where: { orderId: o.id } })).toBe(0);

    const w = await staffReplace(o.id, o.mug, fileBody("w.png"), "workshop");
    expect(w.status, JSON.stringify(w.body)).toBe(200);
    const a = await staffReplace(o.id, o.mug2, fileBody("a.png"), "admin");
    expect(a.status, JSON.stringify(a.body)).toBe(200);
    await expectState(o.id, "SENT_TO_WORKSHOP", ["WAITING", "WAITING", "WAITING", "WAITING"]);
    expect((await line(o.mug)).layoutFixedById).toBe(staff.workshop.id);
    expect((await line(o.mug2)).layoutFixedById).toBe(staff.admin.id);
  });

  it("validation and guards: 400 on bad bodies, 404 unknown order / foreign line, 409 on a non-flagged line", async () => {
    const o = await mixedOrder();
    const other = await mixedOrder();
    await flag(o.id, o.mug, { reason: "wrongFormat" });
    for (const body of [
      { files: [] },
      {},
      { files: [{ fileName: "x.png" }] },
      { files: [{ fileName: "x.png", fileUrl: "uploads/it-lls/x.png" }] },
      { files: [{ fileName: "x.png", fileUrl: "ftp://example.com/x.png" }] },
      { files: [{ fileName: "x.png", fileUrl: "javascript:alert(1)" }] },
    ]) {
      expect((await staffReplace(o.id, o.mug, body)).status, JSON.stringify(body)).toBe(400);
    }
    cookieJar.admin = staff.workshop.token;
    expect((await staffReplaceRoute(req(`/x`, "POST", "{bad"), lineCtx(o.id, o.mug))).status).toBe(400);
    cookieJar.admin = null;
    expect(await staffReplace("00000000-0000-0000-0000-000000000000", o.mug, fileBody("n.png"))).toMatchObject({ status: 404, body: { error: "order_not_found" } });
    expect(await staffReplace(o.id, other.mug, fileBody("n.png"))).toMatchObject({ status: 404, body: { error: "line_not_in_order" } });
    expect(await staffReplace(o.id, o.mug2, fileBody("n.png"))).toMatchObject({ status: 409, body: { error: "line_not_flagged" } });
    await expectState(o.id, "SENT_TO_WORKSHOP", ["NEEDS_LAYOUT", "WAITING", "WAITING", "WAITING"]);
    expect(await prisma.orderFileArchive.count({ where: { orderId: o.id } })).toBe(0);
    expect(await logs(o.id, "line_layout_fixed")).toEqual([]);
  });

  it("upload: archive written, line WAITING with layoutFixedAt, order re-derived, price + stock unchanged, logs by staff", async () => {
    const o = await mixedOrder(dealer);
    await setLines(o.id, [o.banner], "PRINTING");
    await setLines(o.id, [o.mug], "DONE");
    await flag(o.id, o.mug2, { reason: "lowQuality", note: "размыто" });
    await expectState(o.id, "WORKSHOP_PRINTING", ["DONE", "NEEDS_LAYOUT", "WAITING", "PRINTING"]);
    const flaggedAt = (await line(o.mug2)).layoutIssueAt!;
    const priceBefore = Number((await orderRow(o.id)).price);
    const stockBefore = await stockSnapshot(o.id);
    const otherLinesBefore = (await lines(o.id)).filter((l) => l.id !== o.mug2);
    const oldFile = (await line(o.mug2)).files[0]!;
    const before = (await logs(o.id)).length;

    const newKey = uploadKey("mug-b-staff.png");
    const r = await staffReplace(o.id, o.mug2, { files: [{ fileName: "mug-b-staff.png", fileUrl: newKey }] });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({ orderId: o.id, lineId: o.mug2, lineCode: code(o, 2), lineStatus: "WAITING", newOrderStatus: "WORKSHOP_PRINTING" });

    const l = await line(o.mug2);
    expect(l).toMatchObject({ productionStatus: "WAITING", layoutFixedById: staff.workshop.id });
    expect(l.layoutFixedAt!.toISOString()).toBe(r.body.layoutFixedAt);
    await expectNoIssueFields(o.mug2);
    expect(l.files.map((f) => [f.fileName, f.fileUrl, f.copies, f.color])).toEqual([["mug-b-staff.png", newKey, oldFile.copies, oldFile.color]]);

    const archive = await prisma.orderFileArchive.findMany({ where: { orderId: o.id } });
    expect(archive.map((a) => [a.orderLineId, a.fileName, a.fileUrl, a.copies, a.reason, a.archivedById, a.lineProductType])).toEqual([
      [o.mug2, oldFile.fileName, oldFile.fileUrl, oldFile.copies, "layout_issue", staff.workshop.id, "mug"],
    ]);

    await expectState(o.id, "WORKSHOP_PRINTING", ["DONE", "WAITING", "WAITING", "PRINTING"]);
    expect((await lines(o.id)).filter((x) => x.id !== o.mug2)).toEqual(otherLinesBefore);
    expect(Number((await orderRow(o.id)).price)).toBe(priceBefore);
    expect(await stockSnapshot(o.id)).toEqual(stockBefore);

    const added = (await logs(o.id)).slice(before);
    expect(added.map((x) => [x.action, x.oldValue, x.newValue, x.userId])).toEqual(
      expect.arrayContaining([
        ["line_status_changed", "NEEDS_LAYOUT", "WAITING", staff.workshop.id],
        ["line_layout_fixed", oldFile.fileName, "mug-b-staff.png", staff.workshop.id],
      ]),
    );
    expect(added).toHaveLength(2);
    expect(added.find((x) => x.action === "line_layout_fixed")!.metadata).toMatchObject({
      orderLineId: o.mug2,
      lineCode: code(o, 2),
      by: "staff",
      reason: "lowQuality",
      note: "размыто",
      flaggedAt: flaggedAt.toISOString(),
      archivedFiles: [{ id: archive[0]!.id, fileName: oldFile.fileName }],
      files: [{ id: l.files[0]!.id, fileName: "mug-b-staff.png" }],
    });

    // Second replace: no longer flagged.
    expect(await staffReplace(o.id, o.mug2, fileBody("v3.png"))).toMatchObject({ status: 409, body: { error: "line_not_flagged" } });
    expect(await prisma.orderFileArchive.count({ where: { orderId: o.id } })).toBe(1);
  });

  it("the only printing line flagged then fixed by staff: the order status follows the lines", async () => {
    const o = await mixedOrder();
    await setLines(o.id, [o.banner], "PRINTING");
    await flag(o.id, o.banner, { reason: "wrongSize" });
    await expectState(o.id, "SENT_TO_WORKSHOP", ["WAITING", "WAITING", "WAITING", "NEEDS_LAYOUT"]);
    const r = await staffReplace(o.id, o.banner, fileBody("banner-v2.pdf"), "admin");
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({ newOrderStatus: "SENT_TO_WORKSHOP" });
    await expectState(o.id, "SENT_TO_WORKSHOP", ["WAITING", "WAITING", "WAITING", "WAITING"]);
  });

  it("link variant: an http(s) link replaces the file (price + stock unchanged); not allowed for DTF / sheet products", async () => {
    const o = await mixedOrder();
    await flag(o.id, o.banner, { reason: "lowQuality" });
    const priceBefore = Number((await orderRow(o.id)).price);
    const stockBefore = await stockSnapshot(o.id);
    const url = "https://drive.google.com/file/d/abc123/view";
    const r = await staffReplace(o.id, o.banner, { files: [{ fileName: url, fileUrl: url }] }, "admin");
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const l = await line(o.banner);
    expect(l.productionStatus).toBe("WAITING");
    expect(l.layoutFixedAt).not.toBeNull();
    expect(l.files.map((f) => [f.fileName, f.fileUrl])).toEqual([[url, url]]);
    expect(await prisma.orderFileArchive.count({ where: { orderId: o.id, orderLineId: o.banner, reason: "layout_issue" } })).toBe(1);
    expect((await logs(o.id, "line_layout_fixed"))[0]!.metadata).toMatchObject({ by: "staff", files: [{ fileName: url }] });
    expect(Number((await orderRow(o.id)).price)).toBe(priceBefore);
    expect(await stockSnapshot(o.id)).toEqual(stockBefore);
    await expectState(o.id, "SENT_TO_WORKSHOP", ["WAITING", "WAITING", "WAITING", "WAITING"]);

    // DTF / sheet products need the file itself: the core refuses a link (400, link_not_allowed).
    const { staffReplaceLayoutFile, LayoutIssueError } = await import("@/lib/orderLineLayoutIssue");
    await flag(o.id, o.mug, { reason: "lowQuality" });
    await prisma.orderLine.update({ where: { id: o.mug }, data: { productType: "dtf_apparel" } });
    try {
      await expect(
        staffReplaceLayoutFile(prisma, { orderId: o.id, lineId: o.mug, userId: staff.admin.id, files: [{ fileName: url, fileUrl: url }] }),
      ).rejects.toMatchObject({ code: "invalid_file", detail: "link_not_allowed", httpStatus: 400 });
      expect(LayoutIssueError).toBeDefined();
      expect((await line(o.mug)).productionStatus).toBe("NEEDS_LAYOUT");
    } finally {
      await prisma.orderLine.update({ where: { id: o.mug }, data: { productType: "mug" } });
    }
    await clear(o.id, o.mug);
  });

  it("cabinet detail: productionStatus per line (only to word the sentence about the other positions)", async () => {
    const o = await mixedOrder(dealer);
    await flag(o.id, o.mug, { reason: "lowQuality" });
    const d0 = await cabinetDetail(o.id, dealer);
    expect(d0.status).toBe(200);
    const statuses0 = (d0.body.orderLines as { id: string; productionStatus: string }[]).map((l) => l.productionStatus);
    expect(statuses0).toEqual(["NEEDS_LAYOUT", "WAITING", "WAITING", "WAITING"]);
    const { otherLinesProgress } = await import("@/lib/layoutIssue");
    expect(otherLinesProgress(d0.body.orderLines as { id: string; productionStatus: string }[], o.mug)).toBe("queued");
    await setLines(o.id, [o.banner], "PRINTING");
    const d1 = await cabinetDetail(o.id, dealer);
    expect(otherLinesProgress(d1.body.orderLines as { id: string; productionStatus: string }[], o.mug)).toBe("inWork");
  });

  it("all orders this suite touched pass the invariant check", async () => {
    const res = await checkLineStatusSync(prisma, { orderIds: createdIds });
    expect(res.ordersChecked).toBeGreaterThan(3);
    expect(res.mismatches).toEqual([]);
  });
});
