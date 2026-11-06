/**
 * «Нужен макет» (step 3) — gaps found by the test audit of the main suite
 * (`line-layout-issue.test.ts`):
 *
 * - the four production route guards (409 `line_needs_layout`): confirm-roll,
 *   layout-pdf, dtf-film, sheet-product-layout;
 * - large-format replacement with the artwork size check (local storage,
 *   `R2_ACCOUNT_ID=local-dev`, real PNG headers);
 * - no cross-client leak of the cabinet alert (unread, list summary, filter, detail);
 * - order-level status writes over a flagged line leave it (and its flag) alone;
 * - replace while the order is in ISSUE; 21 files; trashed order;
 * - the admin `needsLayout` filter and poll fingerprint over real list data;
 * - races: flag vs dealer edit / cancel, a line starting under the dealer's lock.
 *
 * LOCAL database only. Run with
 * `npx vitest run --config vitest.integration.config.ts tests/integration/line-layout-issue-audit.test.ts`.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
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
import { PATCH as patchOrder } from "@/app/api/orders/[id]/route";
import { PATCH as patchLineStatus } from "@/app/api/orders/[id]/lines/status/route";
import { DELETE as clearRoute, POST as flagRoute } from "@/app/api/orders/[id]/lines/[lineId]/layout-issue/route";
import { POST as replaceRoute } from "@/app/api/cabinet/orders/[id]/lines/[lineId]/replace-file/route";
import { GET as listCabinetOrders, POST as createCabinetOrder } from "@/app/api/cabinet/orders/route";
import { GET as getCabinetOrder, PUT as putCabinetOrder } from "@/app/api/cabinet/orders/[id]/route";
import { GET as cabinetUnread } from "@/app/api/cabinet/unread/route";
import { POST as confirmRoll } from "@/app/api/workshop-board/confirm-roll/route";
import { POST as layoutPdf } from "@/app/api/workshop-board/layout-pdf/route";
import { POST as dtfFilm } from "@/app/api/workshop-board/dtf-film/route";
import { POST as sheetLayout } from "@/app/api/workshop-board/sheet-product-layout/route";
import { flagLineLayoutIssue, LayoutIssueError, ownerReplaceLayoutFile } from "@/lib/orderLineLayoutIssue";
import { dealerCancelOrder, dealerEditOrder, DealerOrderModifyError } from "@/lib/orderCreate/dealerOrderModify";
import { checkLineStatusSync } from "@/lib/orderLineStatusCheck";
import { fetchOrdersData } from "@/lib/fetchOrders";
import { fetchWorkshopSidebarData } from "@/lib/fetchWorkshopSidebar";
import { orderPollFingerprint, type PollFingerprintOrder } from "@/lib/orderPollFingerprint";
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
const lineCtx = (id: string, lineId: string) => ({ params: Promise.resolve({ id, lineId }) });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const stamp = `${Date.now()}`.slice(-7);
let keySeq = 0;
function uploadKey(name: string): string {
  keySeq += 1;
  return `uploads/${Date.now()}-${String(keySeq).padStart(8, "0")}-${name}`;
}

const LOCAL_UPLOADS = path.join(process.cwd(), ".local-uploads");
const writtenKeys: string[] = [];
/** A PNG stored locally under an order upload key; prints `wPx/dpi` × `hPx/dpi` inches. */
async function storePng(name: string, wPx: number, hPx: number, dpi: number): Promise<string> {
  const key = uploadKey(name);
  const file = path.join(LOCAL_UPLOADS, key);
  await mkdir(path.dirname(file), { recursive: true });
  const png = await sharp({ create: { width: wPx, height: hPx, channels: 3, background: "#2a6" } })
    .withMetadata({ density: dpi })
    .png()
    .toBuffer();
  await writeFile(file, png);
  writtenKeys.push(file);
  return key;
}

type Party = { customerId: string; userId: string; token: string };
type Res = { status: number; body: Record<string, unknown> };
async function read(res: Response): Promise<Res> {
  const text = await res.text();
  try {
    return { status: res.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : {} };
  } catch {
    return { status: res.status, body: { raw: text.slice(0, 200) } };
  }
}

describe.skipIf(!isLocalDb)("integration audit: «Нужен макет» gaps", () => {
  let mugId: string;
  let notebookId: string;
  let lf: TestLfMaterial;
  let dealer: Party;
  let retail: Party;
  let stranger: Party;
  const staff: Record<"admin" | "workshop", { id: string; token: string }> = {} as never;
  const phone = `+3736${stamp}1`;
  const createdIds: string[] = [];
  const prevR2 = process.env.R2_ACCOUNT_ID;

  async function makeCustomer(isDealer: boolean, n: number): Promise<Party> {
    const customer = await prisma.studioCustomer.create({
      data: { kind: "INDIVIDUAL", phone: `+3736${stamp}${n + 2}`, personName: `IT audit ${stamp}-${n}`, isDealer },
    });
    const user = await prisma.user.create({
      data: { name: `it-audit-c${n}-${stamp}@anvi.test`, role: "customer", password: hashPassword("x"), studioCustomerId: customer.id },
    });
    return { customerId: customer.id, userId: user.id, token: await createSession(user.id) };
  }

  beforeAll(async () => {
    process.env.R2_ACCOUNT_ID = "local-dev";
    mugId = (await createTestMug(200, { sellPrice: 100, skuPrefix: "IT-AUD" })).id;
    notebookId = (await createTestNotebook(200, "IT-AUD-NB")).id;
    lf = await createTestLfMaterial(`IT AUD BANNER ${stamp}`, { stockLm: 100 });
    dealer = await makeCustomer(true, 1);
    retail = await makeCustomer(false, 2);
    stranger = await makeCustomer(true, 3);
    for (const role of ["admin", "workshop"] as const) {
      const u = await prisma.user.create({ data: { name: `it-aud-${role}-${stamp}@anvi.test`, role, password: hashPassword("x") } });
      staff[role] = { id: u.id, token: await createSession(u.id) };
    }
  });

  afterAll(async () => {
    process.env.R2_ACCOUNT_ID = prevR2;
    for (const f of writtenKeys) await rm(f, { force: true });
    const clientIds = [dealer, retail, stranger].filter(Boolean).map((p) => p.customerId);
    await prisma.order.deleteMany({ where: { OR: [{ clientId: { in: clientIds } }, { phone }, { id: { in: createdIds } }] } });
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

  /** mug + mug + notebook + banner 50×70 cm, SENT_TO_WORKSHOP. */
  async function mixedOrder(owner?: Party): Promise<MixedOrder> {
    cookieJar.admin = staff.admin.token;
    const n = createdIds.length;
    const res = await createAdminOrder(
      req("/api/admin/orders", "POST", {
        phone,
        lines: [
          { productType: "mug", mugProductId: mugId, mugLayoutData: layout, files: [{ fileName: "mug-a.png", fileUrl: `uploads/it-aud/mug-a-${n}.png`, copies: 1, color: "color" }] },
          { productType: "mug", mugProductId: mugId, mugLayoutData: layout, files: [{ fileName: "mug-b.png", fileUrl: `uploads/it-aud/mug-b-${n}.png`, copies: 1, color: "color" }] },
          { productType: "notebook", notebookProductId: notebookId, notebookLayoutData: layout, files: [{ fileName: "nb.png", fileUrl: `uploads/it-aud/nb-${n}.png`, copies: 1, color: "color" }] },
          {
            productType: "large_format_print",
            largeFormatMaterialId: lf.id,
            printWidthCm: 50,
            printHeightCm: 70,
            quantity: 1,
            customerType: "retail",
            files: [{ fileName: "banner.png", fileUrl: `uploads/it-aud/banner-${n}.png`, copies: 1, color: "color" }],
          },
        ],
      }),
    );
    const body = (await res.json()) as { id: string; orderNumber: number };
    expect(res.status, JSON.stringify(body)).toBe(201);
    cookieJar.admin = null;
    createdIds.push(body.id);
    if (owner) await prisma.order.update({ where: { id: body.id }, data: { clientId: owner.customerId } });
    const ls = await lines(body.id);
    return { id: body.id, orderNumber: body.orderNumber, mug: ls[0]!.id, mug2: ls[1]!.id, notebook: ls[2]!.id, banner: ls[3]!.id };
  }

  const code = (o: { orderNumber: number }, i: number, total = 4) => `#${String(o.orderNumber).padStart(4, "0")}.${i}/${total}`;

  async function lines(orderId: string) {
    return prisma.orderLine.findMany({ where: { orderId }, orderBy: { sortOrder: "asc" }, include: { files: { orderBy: { fileName: "asc" } } } });
  }
  async function line(lineId: string) {
    return prisma.orderLine.findUniqueOrThrow({ where: { id: lineId }, include: { files: true } });
  }
  async function logs(orderId: string, action?: string) {
    return prisma.orderLog.findMany({ where: { orderId, ...(action ? { action } : {}) }, orderBy: { createdAt: "asc" } });
  }
  async function flag(orderId: string, lineId: string, body: unknown = { reason: "lowQuality" }): Promise<Res> {
    cookieJar.admin = staff.workshop.token;
    const r = await read(await flagRoute(req(`/x`, "POST", body), lineCtx(orderId, lineId)));
    cookieJar.admin = null;
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    return r;
  }
  async function clear(orderId: string, lineId: string): Promise<Res> {
    cookieJar.admin = staff.workshop.token;
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
  async function asWorkshop<T>(fn: () => Promise<Response>): Promise<Res> {
    cookieJar.admin = staff.workshop.token;
    try {
      return await read(await fn());
    } finally {
      cookieJar.admin = null;
    }
  }
  async function asCustomer(p: Party, fn: () => Promise<Response>): Promise<Res> {
    cookieJar.customer = p.token;
    try {
      return await read(await fn());
    } finally {
      cookieJar.customer = null;
    }
  }
  async function expectInvariant(orderId: string) {
    expect((await checkLineStatusSync(prisma, { orderIds: [orderId] })).mismatches).toEqual([]);
  }

  // ─── 1. Production route guards ──────────────────────────────────────────

  describe("production route guards → 409 line_needs_layout", () => {
    it("confirm-roll: a flagged banner (alone or in a batch) is refused, nothing moves; unflagged passes", async () => {
      const o = await mixedOrder();
      const other = await mixedOrder();
      await flag(o.id, o.banner);
      const movesBefore = await prisma.stockMovement.count({ where: { orderId: { in: [o.id, other.id] } } });
      for (const ids of [[o.banner], [other.banner, o.banner]]) {
        const r = await asWorkshop(() => confirmRoll(req("/x", "POST", { targetMaterialId: lf.id, orderLineIds: ids })));
        expect(r, JSON.stringify(ids)).toMatchObject({ status: 409, body: { error: "line_needs_layout" } });
      }
      expect(await prisma.stockMovement.count({ where: { orderId: { in: [o.id, other.id] } } })).toBe(movesBefore);
      const ok = await asWorkshop(() => confirmRoll(req("/x", "POST", { targetMaterialId: lf.id, orderLineIds: [other.banner] })));
      expect(ok.status, JSON.stringify(ok.body)).toBe(200);
      // After the fix the banner may go on the roll again.
      await clear(o.id, o.banner);
      const ok2 = await asWorkshop(() => confirmRoll(req("/x", "POST", { targetMaterialId: lf.id, orderLineIds: [o.banner] })));
      expect(ok2.status, JSON.stringify(ok2.body)).toBe(200);
    });

    it("layout-pdf: a tile of a flagged line is refused; an unflagged one gets past the guard", async () => {
      const o = await mixedOrder();
      await flag(o.id, o.banner);
      const bannerFile = (await line(o.banner)).files[0]!.id;
      const body = (fileId: string) => ({
        materialLabel: "Banner",
        printableWidthCm: 120,
        totalAlongCm: 70,
        placements: [{ tileId: "t1", label: "x", xCm: 0, yCm: 0, widthCm: 50, heightCm: 70, rotated: false }],
        tiles: [{ tileId: "t1", fileId }],
      });
      expect(await asWorkshop(() => layoutPdf(req("/x", "POST", body(bannerFile))))).toMatchObject({
        status: 409,
        body: { error: "line_needs_layout" },
      });
      const other = await mixedOrder();
      const otherFile = (await line(other.banner)).files[0]!.id;
      const r = await asWorkshop(() => layoutPdf(req("/x", "POST", body(otherFile))));
      expect(r.body.error).not.toBe("line_needs_layout"); // the stored file is missing in the test: any other answer
    });

    it("dtf-film: a transfer of a flagged line is refused (preview and pdf), mixed with others too", async () => {
      const o = await mixedOrder();
      const other = await mixedOrder();
      await flag(o.id, o.mug);
      const flagged = (await line(o.mug)).files[0]!.id;
      const ok = (await line(other.mug)).files[0]!.id;
      for (const mode of ["preview", "pdf"] as const) {
        const r = await asWorkshop(() =>
          dtfFilm(
            req("/x", "POST", {
              mode,
              transfers: [
                { tileId: "a", fileId: ok, widthCm: 10, heightCm: 10 },
                { tileId: "b", fileId: flagged, widthCm: 10, heightCm: 10 },
              ],
            }),
          ),
        );
        expect(r, mode).toMatchObject({ status: 409, body: { error: "line_needs_layout" } });
      }
      const r2 = await asWorkshop(() =>
        dtfFilm(req("/x", "POST", { mode: "preview", transfers: [{ tileId: "a", fileId: ok, widthCm: 10, heightCm: 10 }] })),
      );
      expect(r2.body.error).not.toBe("line_needs_layout");
    });

    it("sheet-product-layout: a flagged business-card line is refused; after the clear it gets past the guard", async () => {
      const o = await mixedOrder();
      const bc = await prisma.orderLine.create({
        data: {
          orderId: o.id,
          sortOrder: 10,
          productType: "business_card",
          productionStatus: "WAITING",
          files: { create: { orderId: o.id, fileName: "bc.png", fileUrl: "uploads/it-aud/bc.png", copies: 1, color: "color" } },
        },
      });
      await flag(o.id, bc.id);
      expect(await asWorkshop(() => sheetLayout(req("/x", "POST", { orderLineId: bc.id })))).toMatchObject({
        status: 409,
        body: { error: "line_needs_layout" },
      });
      expect((await clear(o.id, bc.id)).status).toBe(200);
      const r = await asWorkshop(() => sheetLayout(req("/x", "POST", { orderLineId: bc.id })));
      expect(r.body.error).not.toBe("line_needs_layout"); // no grid data in the test: another refusal
    });
  });

  // ─── 2. Large-format replacement (artwork size check) ───────────────────

  describe("large-format replacement", () => {
    it("artwork larger than the ordered 50×70 → 422, nothing changes; a fitting file → WAITING, no stock / price change", async () => {
      const o = await mixedOrder(dealer);
      await flag(o.id, o.banner, { reason: "wrongSize", note: "нужно 50×70" });
      const before = await line(o.banner);
      const priceBefore = Number((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).price);
      const lfDataBefore = before.largeFormatLineData;
      const movesBefore = await prisma.stockMovement.findMany({ where: { orderId: o.id }, select: { id: true } });

      // 2400×2400 px at 72 dpi = 84.7×84.7 cm.
      const big = await storePng("huge.png", 2400, 2400, 72);
      const r = await replace(o.id, o.banner, { files: [{ fileName: "huge.png", fileUrl: big }] }, dealer);
      expect(r).toMatchObject({ status: 422, body: { error: "artwork_larger_than_ordered", detail: "huge.png" } });
      const still = await line(o.banner);
      expect(still.productionStatus).toBe("NEEDS_LAYOUT");
      expect(still.files.map((f) => f.id)).toEqual(before.files.map((f) => f.id));
      expect(await prisma.orderFileArchive.count({ where: { orderId: o.id } })).toBe(0);

      // 1417×1984 px at 72 dpi ≈ 50×70 cm.
      const fit = await storePng("fit.png", 1417, 1984, 72);
      const ok = await replace(o.id, o.banner, { files: [{ fileName: "fit.png", fileUrl: fit }] }, dealer);
      expect(ok.status, JSON.stringify(ok.body)).toBe(200);
      const after = await line(o.banner);
      expect(after).toMatchObject({ productionStatus: "WAITING", layoutFixedById: dealer.userId, layoutIssueReason: null });
      expect(after.files.map((f) => f.fileUrl)).toEqual([fit]);
      expect(after.largeFormatLineData).toEqual(lfDataBefore);
      expect(Number((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).price)).toBe(priceBefore);
      expect(await prisma.stockMovement.findMany({ where: { orderId: o.id }, select: { id: true } })).toEqual(movesBefore);
      const arch = await prisma.orderFileArchive.findMany({ where: { orderId: o.id } });
      expect(arch.map((a) => [a.orderLineId, a.reason, a.lineProductType])).toEqual([[o.banner, "layout_issue", "large_format_print"]]);
      await expectInvariant(o.id);
    });

    it("a missing stored file does not block (storage hiccup), like the dealer wizard", async () => {
      const o = await mixedOrder(retail);
      await flag(o.id, o.banner);
      const r = await replace(o.id, o.banner, { files: [{ fileName: "nofile.png", fileUrl: uploadKey("nofile.png") }] }, retail);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
    });
  });

  // ─── 3. Replace: other edge cases ────────────────────────────────────────

  describe("replace edge cases", () => {
    it("21 files → 400; a trashed order → 404; a replace on an ISSUE order keeps ISSUE", async () => {
      const o = await mixedOrder(dealer);
      await flag(o.id, o.mug);
      const many = Array.from({ length: 21 }, (_, i) => ({ fileName: `f${i}.png`, fileUrl: uploadKey(`f${i}.png`) }));
      expect((await replace(o.id, o.mug, { files: many }, dealer)).status).toBe(400);
      expect((await replace(o.id, o.mug, { files: [{ fileName: "", fileUrl: uploadKey("x.png") }] }, dealer)).status).toBe(400);
      expect((await replace(o.id, o.mug, { files: "nope" }, dealer)).status).toBe(400);

      await setOrderStatus(o.id, "ISSUE", { issueReason: "ждём клиента" });
      const r = await replace(o.id, o.mug, { files: [{ fileName: "v2.png", fileUrl: uploadKey("v2.png") }] }, dealer);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("ISSUE");
      expect((await line(o.mug)).productionStatus).toBe("WAITING");

      const t = await mixedOrder(dealer);
      await flag(t.id, t.mug);
      await prisma.order.update({ where: { id: t.id }, data: { deletedAt: new Date() } });
      expect(await replace(t.id, t.mug, { files: [{ fileName: "x.png", fileUrl: uploadKey("x.png") }] }, dealer)).toEqual({
        status: 404,
        body: { error: "Not found" },
      });
      expect((await line(t.mug)).productionStatus).toBe("NEEDS_LAYOUT");
    });

    it("ownership is re-checked under the lock: the order re-linked to another client just before → order_not_found, nothing written", async () => {
      const o = await mixedOrder(dealer);
      await flag(o.id, o.mug);
      const err = await ownerReplaceLayoutFile(prisma, {
        orderId: o.id,
        lineId: o.mug,
        actor: { userId: dealer.userId, studioCustomerId: dealer.customerId },
        files: [{ fileName: "x.png", fileUrl: uploadKey("x.png") }],
        hooks: { beforeLock: async () => void (await prisma.order.update({ where: { id: o.id }, data: { clientId: stranger.customerId } })) },
      }).then(
        () => null,
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(LayoutIssueError);
      expect((err as LayoutIssueError).code).toBe("order_not_found");
      expect((await line(o.mug)).productionStatus).toBe("NEEDS_LAYOUT");
      expect(await prisma.orderFileArchive.count({ where: { orderId: o.id } })).toBe(0);
    });

    it("the order owner by phone only (no clientId) cannot replace: 404", async () => {
      const o = await mixedOrder(); // no clientId
      await flag(o.id, o.mug);
      expect((await replace(o.id, o.mug, { files: [{ fileName: "x.png", fileUrl: uploadKey("x.png") }] }, dealer)).status).toBe(404);
    });
  });

  // ─── 4. No cross-client leak in the cabinet alert ───────────────────────

  it("cabinet: another client sees none of the owner's flags (unread, list, summary, filter, detail)", async () => {
    const owner = await makeCustomer(true, 8);
    const other = await makeCustomer(false, 9);
    try {
      const o = await mixedOrder(owner);
      const mine = await mixedOrder(other); // the other client's own, unflagged order
      await flag(o.id, o.mug);
      await flag(o.id, o.notebook);

      const u = await asCustomer(other, () => cabinetUnread());
      expect(u.body.layoutIssueOrders).toEqual([]);
      const list = await asCustomer(other, () => listCabinetOrders(req("/api/cabinet/orders", "GET")));
      expect((list.body.summary as Record<string, unknown>).needsLayoutCount).toBe(0);
      const ids = (list.body.orders as Array<{ id: string; needsLayoutCount: number }>).map((x) => x.id);
      expect(ids).toEqual([mine.id]);
      expect(JSON.stringify(list.body)).not.toContain(o.id);
      const filtered = await asCustomer(other, () => listCabinetOrders(req("/api/cabinet/orders?status=needsLayout", "GET")));
      expect(filtered.body.orders).toEqual([]);
      expect((filtered.body.summary as Record<string, unknown>).needsLayoutCount).toBe(0);
      expect((await asCustomer(other, () => getCabinetOrder(req("/x", "GET"), ctx(o.id)))).status).toBe(404);

      // The owner sees exactly their order, once.
      const ou = await asCustomer(owner, () => cabinetUnread());
      expect(ou.body.layoutIssueOrders).toEqual([{ id: o.id, orderNumber: o.orderNumber, lineCount: 2, since: expect.any(String) }]);
      const ol = await asCustomer(owner, () => listCabinetOrders(req("/api/cabinet/orders?status=needsLayout", "GET")));
      expect((ol.body.orders as Array<{ id: string }>).map((x) => x.id)).toEqual([o.id]);
      // Anonymous: 401.
      expect((await read(await cabinetUnread())).status).toBe(401);
    } finally {
      await prisma.order.deleteMany({ where: { clientId: { in: [owner.customerId, other.customerId] } } });
      await prisma.user.deleteMany({ where: { id: { in: [owner.userId, other.userId] } } });
      await prisma.studioCustomer.deleteMany({ where: { id: { in: [owner.customerId, other.customerId] } } });
    }
  });

  // ─── 5. Order-level status writes over a flagged line ───────────────────

  describe("order-level status write over a flagged line", () => {
    it("«Весь заказ: Начать печать» (WORKSHOP_PRINTING): the flagged line keeps its status and flag, nothing is cleared", async () => {
      const o = await mixedOrder();
      await flag(o.id, o.mug2, { reason: "lowQuality", note: "мыло" });
      await setOrderStatus(o.id, "WORKSHOP_PRINTING");
      const ls = await lines(o.id);
      expect(ls.map((l) => l.productionStatus)).toEqual(["PRINTING", "NEEDS_LAYOUT", "PRINTING", "PRINTING"]);
      expect(await line(o.mug2)).toMatchObject({ layoutIssueReason: "lowQuality", layoutIssueNote: "мыло", layoutIssueById: staff.workshop.id });
      expect(await logs(o.id, "line_layout_cleared")).toHaveLength(0);
      await expectInvariant(o.id);
    });

    it("re-sending the same order status keeps the flag, silently and without a log", async () => {
      const o = await mixedOrder();
      await flag(o.id, o.mug);
      await setOrderStatus(o.id, "SENT_TO_WORKSHOP");
      expect((await line(o.mug)).productionStatus).toBe("NEEDS_LAYOUT");
      expect(await logs(o.id, "line_layout_cleared")).toHaveLength(0);
      await expectInvariant(o.id);
    });

    it("ISSUE writes nothing about the flag", async () => {
      const o = await mixedOrder();
      await flag(o.id, o.mug);
      await setOrderStatus(o.id, "ISSUE", { issueReason: "x" });
      expect(await logs(o.id, "line_layout_cleared")).toHaveLength(0);
    });
  });

  // ─── 6. Admin list filter + poll fingerprint over real data ─────────────

  it("admin list: needsLayout filter + layoutIssueOrders; fingerprint changes on flag and on fix", async () => {
    const o = await mixedOrder();
    const plain = await mixedOrder();
    const user = { id: staff.admin.id, name: "a", role: "admin" };
    const fp = async () => {
      const d = await fetchOrdersData(user, { search: String(o.orderNumber), limit: 50 });
      const rows = JSON.parse(JSON.stringify(d.orders)) as PollFingerprintOrder[];
      return orderPollFingerprint(rows.filter((r) => r.id === o.id));
    };
    const f0 = await fp();
    await flag(o.id, o.mug);
    const f1 = await fp();
    expect(f1).not.toBe(f0);
    const filtered = await fetchOrdersData(user, { search: phone, needsLayoutOnly: true, limit: 100 });
    const ids = filtered.orders.map((x) => x.id as string);
    expect(ids).toContain(o.id);
    expect(ids).not.toContain(plain.id);
    expect(filtered.layoutIssueOrders!.some((x) => x.id === o.id && x.lineCount === 1)).toBe(true);
    expect(filtered.layoutIssueOrders!.some((x) => x.id === plain.id)).toBe(false);

    await replace(o.id, o.mug, { files: [{ fileName: "x.png", fileUrl: uploadKey("x.png") }] }, null); // anonymous: no-op
    await prisma.order.update({ where: { id: o.id }, data: { clientId: retail.customerId } });
    const fix = await replace(o.id, o.mug, { files: [{ fileName: "x.png", fileUrl: uploadKey("x.png") }] }, retail);
    expect(fix.status).toBe(200);
    const f2 = await fp();
    // Line is WAITING again — same status as at f0 — but the fingerprint still moves (layoutFixedAt).
    expect(f2).not.toBe(f1);
    expect(f2).not.toBe(f0);
    const after = await fetchOrdersData(user, { search: phone, needsLayoutOnly: true, limit: 100 });
    expect(after.orders.map((x) => x.id)).not.toContain(o.id);
  });

  it("workshop sidebar carries the reason and comment of a flagged line (not «Другое»)", async () => {
    const o = await mixedOrder();
    await flag(o.id, o.mug);
    const user = { id: staff.admin.id, name: "a", role: "admin" };
    const d = await fetchWorkshopSidebarData(user, { search: String(o.orderNumber) });
    const rows = JSON.parse(JSON.stringify(d.workshopOrders)) as Array<{
      id: string;
      orderLines: Array<{ id: string; productionStatus: string; layoutIssueReason: string | null; layoutIssueNote: string | null; layoutIssueAt: string | null }>;
    }>;
    const row = rows.find((r) => r.id === o.id);
    expect(row).toBeTruthy();
    const line = row!.orderLines.find((l) => l.id === o.mug)!;
    expect(line.productionStatus).toBe("NEEDS_LAYOUT");
    const stored = await prisma.orderLine.findUniqueOrThrow({ where: { id: o.mug } });
    expect(line.layoutIssueReason).toBe(stored.layoutIssueReason);
    expect(line.layoutIssueReason).not.toBeNull();
    expect(line.layoutIssueNote).toBe(stored.layoutIssueNote);
    expect(line.layoutIssueAt).not.toBeNull();
  });

  // ─── 7. Races with the dealer's edit / cancel ───────────────────────────

  describe("races: staff vs dealer", () => {
    async function dealerOrder(): Promise<{ id: string; l1: string; l2: string; f1: string; f2: string }> {
      const created = await asCustomer(dealer, () =>
        createCabinetOrder(
          req("/api/cabinet/orders", "POST", {
            lines: [
              { productType: "mug", mugProductId: mugId, mugLayoutData: layout, files: [{ fileName: "r1.png", fileUrl: uploadKey("r1.png"), copies: 1, color: "color" }] },
              { productType: "mug", mugProductId: mugId, mugLayoutData: layout, files: [{ fileName: "r2.png", fileUrl: uploadKey("r2.png"), copies: 1, color: "color" }] },
            ],
          }),
        ),
      );
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      const id = created.body.id as string;
      createdIds.push(id);
      await setOrderStatus(id, "SENT_TO_WORKSHOP");
      const ls = await lines(id);
      return { id, l1: ls[0]!.id, l2: ls[1]!.id, f1: ls[0]!.files[0]!.id, f2: ls[1]!.files[0]!.id };
    }
    const actor = () => ({ userId: dealer.userId, studioCustomerId: dealer.customerId });

    it("flag holds the row lock while the dealer edit starts → the edit waits, then succeeds; the flag survives an edit that keeps the file", async () => {
      const o = await dealerOrder();
      let editP: Promise<unknown> | null = null;
      let settled = false;
      await flagLineLayoutIssue(prisma, {
        orderId: o.id,
        lineId: o.l2,
        reason: "lowQuality",
        userId: staff.workshop.id,
        hooks: {
          afterLock: async () => {
            editP = dealerEditOrder({
              orderId: o.id,
              actor: actor(),
              input: {
                notes: "правка",
                lines: [
                  { orderLineId: o.l1, productType: "mug", mugProductId: mugId, files: [{ fileId: o.f1, copies: 1 }] },
                  { orderLineId: o.l2, productType: "mug", mugProductId: mugId, files: [{ fileId: o.f2, copies: 1 }] },
                ],
              } as never,
            });
            editP.then(
              () => (settled = true),
              () => (settled = true),
            );
            await sleep(400);
            expect(settled).toBe(false);
          },
        },
      });
      await editP;
      const ls = await lines(o.id);
      expect(ls.map((l) => l.productionStatus).sort()).toEqual(["NEEDS_LAYOUT", "WAITING"]);
      expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).notes).toBe("правка");
      await expectInvariant(o.id);
    });

    it("a line starts printing just before the dealer's cancel locks → cancel refused (re-check under the lock)", async () => {
      const o = await dealerOrder();
      const err = await dealerCancelOrder({
        orderId: o.id,
        actor: actor(),
        reason: "передумал",
        hooks: { beforeLock: async () => void expect((await setLines(o.id, [o.l1], "PRINTING")).status).toBe(200) },
      }).then(
        () => null,
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(DealerOrderModifyError);
      expect((err as DealerOrderModifyError).code).toBe("order_locked");
      expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).deletedAt).toBeNull();
    });

    it("a flag landing just before the dealer's cancel locks does not block the cancel; the replace afterwards is 404", async () => {
      const o = await dealerOrder();
      await dealerCancelOrder({
        orderId: o.id,
        actor: actor(),
        reason: "передумал",
        hooks: { beforeLock: async () => void (await flag(o.id, o.l1)) },
      });
      expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).deletedAt).not.toBeNull();
      expect((await replace(o.id, o.l1, { files: [{ fileName: "x.png", fileUrl: uploadKey("x.png") }] }, dealer)).status).toBe(404);
      expect(((await asCustomer(dealer, () => cabinetUnread())).body.layoutIssueOrders as Array<{ id: string }>).some((x) => x.id === o.id)).toBe(false);
    });

    it("dealer PUT via HTTP on SENT_TO_WORKSHOP with one DONE line → 409 order_locked", async () => {
      const o = await dealerOrder();
      expect((await setLines(o.id, [o.l1], "DONE")).status).toBe(200);
      const put = await asCustomer(dealer, () =>
        putCabinetOrder(
          req("/x", "PUT", {
            lines: [{ orderLineId: o.l2, productType: "mug", mugProductId: mugId, files: [{ fileId: o.f2, copies: 1 }] }],
          }),
          ctx(o.id),
        ),
      );
      expect(put).toMatchObject({ status: 409, body: { code: "order_locked" } });
      expect(await lines(o.id)).toHaveLength(2);
    });
  });

  it("all orders this suite touched pass the invariant check", async () => {
    const res = await checkLineStatusSync(prisma, { orderIds: createdIds });
    expect(res.mismatches).toEqual([]);
  });
});
