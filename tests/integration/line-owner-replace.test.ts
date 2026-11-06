/**
 * Per-line production status, step 4 (part 1): the order's owner (dealer or
 * retail client) replaces the file of a not-yet-started (WAITING) line from
 * the cabinet while other lines print or are done
 * (`POST /api/cabinet/orders/[id]/lines/[lineId]/replace-file` with
 * `kind: "replace"`, `ownerReplaceLineFile`, `canOwnerReplaceLineFile`).
 *
 * Mixed order: mug (.1/3) + notebook (.2/3) + banner 50×70 cm (.3/3).
 *
 * Route handlers run in-process with real sessions against a LOCAL database
 * (refuses any other DATABASE_URL). Run with
 * `npx vitest run --config vitest.integration.config.ts tests/integration/line-owner-replace.test.ts`.
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
import { POST as flagRoute, DELETE as clearFlagRoute } from "@/app/api/orders/[id]/lines/[lineId]/layout-issue/route";
import { POST as staffReplaceRoute } from "@/app/api/orders/[id]/lines/[lineId]/replace-file/route";
import { POST as replaceRoute } from "@/app/api/cabinet/orders/[id]/lines/[lineId]/replace-file/route";
import { GET as listCabinetOrders } from "@/app/api/cabinet/orders/route";
import { GET as getCabinetOrder, PUT as putCabinetOrder } from "@/app/api/cabinet/orders/[id]/route";
import { POST as cancelCabinetOrder } from "@/app/api/cabinet/orders/[id]/cancel/route";
import { LayoutIssueError, ownerReplaceLineFile } from "@/lib/orderLineLayoutIssue";
import { deriveWorkshopOrderStatus } from "@/lib/orderStatusFromLines";
import { checkLineStatusSync } from "@/lib/orderLineStatusCheck";
import { fetchWorkshopBoardData } from "@/lib/fetchWorkshopBoardData";
import { fetchOrdersData } from "@/lib/fetchOrders";
import { fetchWorkshopSidebarData } from "@/lib/fetchWorkshopSidebar";
import { orderPollFingerprint, type PollFingerprintOrder } from "@/lib/orderPollFingerprint";
import { isOwnerReplaceMarkerVisible } from "@/lib/ownerLineFileReplace";
import type { OrderStatus } from "@/lib/validations";
import { cleanupTestMugs, createTestMug, mugStock } from "./mugSeed";
import { cleanupTestNotebook, createTestNotebook, notebookStock } from "./notebookSeed";
import { cleanupTestLfMaterial, createTestLfMaterial, rollStock, type TestLfMaterial } from "./lfMaterialSeed";

const layout = {
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
const replaceBody = (name: string) => ({ files: [{ fileName: name, fileUrl: uploadKey(name) }], kind: "replace" });

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

describe.skipIf(!isLocalDb)("integration: owner replaces the file of a waiting line (step 4)", () => {
  let mugId: string;
  let notebookId: string;
  let lf: TestLfMaterial;
  let dealer: Party;
  let retail: Party;
  let stranger: Party;
  const staff: Record<"admin" | "workshop", { id: string; token: string }> = {} as never;
  const phone = `+3735${stamp}1`;
  const createdIds: string[] = [];
  const prevR2 = process.env.R2_ACCOUNT_ID;

  async function makeCustomer(isDealer: boolean, n: number): Promise<Party> {
    const customer = await prisma.studioCustomer.create({
      data: { kind: "INDIVIDUAL", phone: `+3735${stamp}${n + 2}`, personName: `IT owner-replace ${stamp}-${n}`, isDealer },
    });
    const user = await prisma.user.create({
      data: { name: `it-ownrep-c${n}-${stamp}@anvi.test`, role: "customer", password: hashPassword("x"), studioCustomerId: customer.id },
    });
    return { customerId: customer.id, userId: user.id, token: await createSession(user.id) };
  }

  beforeAll(async () => {
    process.env.R2_ACCOUNT_ID = "local-dev";
    mugId = (await createTestMug(200, { sellPrice: 100, skuPrefix: "IT-OWR" })).id;
    notebookId = (await createTestNotebook(200, "IT-OWR-NB")).id;
    lf = await createTestLfMaterial(`IT OWR BANNER ${stamp}`, { stockLm: 100 });
    dealer = await makeCustomer(true, 1);
    retail = await makeCustomer(false, 2);
    stranger = await makeCustomer(true, 3);
    for (const role of ["admin", "workshop"] as const) {
      const u = await prisma.user.create({ data: { name: `it-owr-${role}-${stamp}@anvi.test`, role, password: hashPassword("x") } });
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
    notebook: string;
    banner: string;
  }

  /** mug (.1/3) + notebook (.2/3) + banner 50×70 (.3/3), SENT_TO_WORKSHOP, owned by `owner`. */
  async function mixedOrder(owner: Party | null): Promise<MixedOrder> {
    cookieJar.admin = staff.admin.token;
    const n = createdIds.length;
    const res = await createAdminOrder(
      req("/api/admin/orders", "POST", {
        phone,
        lines: [
          { productType: "mug", mugProductId: mugId, mugLayoutData: layout, files: [{ fileName: "mug.png", fileUrl: `uploads/it-owr/mug-${n}.png`, copies: 2, color: "color" }] },
          { productType: "notebook", notebookProductId: notebookId, notebookLayoutData: layout, files: [{ fileName: "nb.png", fileUrl: `uploads/it-owr/nb-${n}.png`, copies: 1, color: "color" }] },
          {
            productType: "large_format_print",
            largeFormatMaterialId: lf.id,
            printWidthCm: 50,
            printHeightCm: 70,
            quantity: 1,
            customerType: "retail",
            files: [{ fileName: "banner.png", fileUrl: `uploads/it-owr/banner-${n}.png`, copies: 1, color: "color" }],
          },
        ],
      }),
    );
    const body = (await res.json()) as { id: string; orderNumber: number; status: string };
    expect(res.status, JSON.stringify(body)).toBe(201);
    expect(body.status).toBe("SENT_TO_WORKSHOP");
    cookieJar.admin = null;
    createdIds.push(body.id);
    // A real price: the admin create leaves it NULL, and NULL + 1 is still NULL — the
    // «no price change» snapshot would then be vacuous.
    await prisma.order.update({ where: { id: body.id }, data: { price: "321.50", ...(owner ? { clientId: owner.customerId } : {}) } });
    const ls = await lines(body.id);
    expect(ls.map((l) => l.productType)).toEqual(["mug", "notebook", "large_format_print"]);
    expect(String((await orderRow(body.id)).price)).toBe("321.5");
    return { id: body.id, orderNumber: body.orderNumber, mug: ls[0]!.id, notebook: ls[1]!.id, banner: ls[2]!.id };
  }

  const code = (o: { orderNumber: number }, i: number) => `#${String(o.orderNumber).padStart(4, "0")}.${i}/3`;

  async function lines(orderId: string) {
    return prisma.orderLine.findMany({ where: { orderId }, orderBy: { sortOrder: "asc" }, include: { files: { orderBy: { fileName: "asc" } } } });
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
  async function replace(orderId: string, lineId: string, body: unknown, as: Party | null | { token: string }): Promise<Res> {
    cookieJar.customer = as?.token ?? null;
    const r = await read(await replaceRoute(req(`/x`, "POST", body), lineCtx(orderId, lineId)));
    cookieJar.customer = null;
    return r;
  }
  async function setLines(orderId: string, lineIds: string[], status: string): Promise<Res> {
    cookieJar.admin = staff.workshop.token;
    const r = await read(await patchLineStatus(req(`/x`, "PATCH", { lineIds, status }), ctx(orderId)));
    cookieJar.admin = null;
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    return r;
  }
  async function setOrderStatus(orderId: string, status: OrderStatus, extra: Record<string, unknown> = {}) {
    cookieJar.admin = staff.admin.token;
    const r = await read(await patchOrder(req(`/x`, "PATCH", { status, ...extra }), ctx(orderId)));
    cookieJar.admin = null;
    expect(r.status, JSON.stringify(r.body)).toBe(200);
  }
  async function flag(orderId: string, lineId: string) {
    cookieJar.admin = staff.workshop.token;
    const r = await read(await flagRoute(req(`/x`, "POST", { reason: "lowQuality", note: "72 dpi" }), lineCtx(orderId, lineId)));
    cookieJar.admin = null;
    expect(r.status, JSON.stringify(r.body)).toBe(200);
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
  async function dealerPut(orderId: string): Promise<Res> {
    const ls = await lines(orderId);
    cookieJar.customer = dealer.token;
    const r = await read(
      await putCabinetOrder(
        req(`/x`, "PUT", {
          lines: [{ orderLineId: ls[0]!.id, productType: "mug", mugProductId: mugId, files: [{ fileId: ls[0]!.files[0]!.id, copies: 5 }] }],
        }),
        ctx(orderId),
      ),
    );
    cookieJar.customer = null;
    return r;
  }
  async function dealerCancel(orderId: string, as: Party = dealer): Promise<Res> {
    cookieJar.customer = as.token;
    const r = await read(await cancelCabinetOrder(req(`/x`, "POST", { reason: "передумал" }), ctx(orderId)));
    cookieJar.customer = null;
    return r;
  }

  /** Everything a file replacement must not touch: money, quantities, stock, statuses, line JSON. */
  async function snapshot(orderId: string) {
    const o = await orderRow(orderId);
    const ls = await lines(orderId);
    const moves = await prisma.stockMovement.findMany({
      where: { orderId },
      select: { id: true, variantId: true, delta: true },
      orderBy: { createdAt: "asc" },
    });
    return {
      price: String(o.price),
      deliveryPriceMdl: String(o.deliveryPriceMdl),
      promoDiscountMdl: String(o.promoDiscountMdl),
      paidAt: o.paidAt?.toISOString() ?? null,
      isPaid: o.isPaid,
      status: o.status,
      lineCount: ls.length,
      lines: ls.map((l) => ({
        id: l.id,
        productType: l.productType,
        productionStatus: l.productionStatus,
        mugProductId: l.mugProductId,
        notebookProductId: l.notebookProductId,
        largeFormatLineData: l.largeFormatLineData,
        copies: l.files.map((f) => f.copies),
        colors: l.files.map((f) => f.color),
      })),
      moves,
      mug: await mugStock(mugId),
      notebook: await notebookStock(notebookId),
      roll: await rollStock(lf.variantId),
    };
  }

  async function expectInvariant(orderId: string) {
    const o = await orderRow(orderId);
    const ls = await lines(orderId);
    if (["SENT_TO_WORKSHOP", "WORKSHOP_PRINTING", "WORKSHOP_READY"].includes(o.status)) {
      expect(deriveWorkshopOrderStatus(ls)).toBe(o.status);
    }
    expect((await checkLineStatusSync(prisma, { orderIds: [orderId] })).mismatches).toEqual([]);
  }

  // ─── 1. The owner's goal: fix the mug while the banner prints ───────────

  describe("WAITING line while other lines are in work", () => {
    it("banner PRINTING → dealer replaces the notebook: 200; only the file changes", async () => {
      const o = await mixedOrder(dealer);
      await setLines(o.id, [o.banner], "PRINTING");
      expect((await orderRow(o.id)).status).toBe("WORKSHOP_PRINTING");
      const before = await snapshot(o.id);
      const oldFiles = (await line(o.notebook)).files;

      const r = await replace(o.id, o.notebook, replaceBody("nb-v2.png"), dealer);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body).toMatchObject({ orderId: o.id, lineId: o.notebook, kind: "replace", lineStatus: "WAITING", layoutFixedAt: null });
      expect(typeof r.body.replacedAt).toBe("string");

      const after = await snapshot(o.id);
      // Price, quantity, stock, statuses, line JSON: all unchanged.
      expect(after).toEqual(before);
      const nb = await line(o.notebook);
      expect(nb.productionStatus).toBe("WAITING");
      expect(nb.files.map((f) => f.fileName)).toEqual(["nb-v2.png"]);
      expect(nb.files[0]!.copies).toBe(oldFiles[0]!.copies);
      expect(nb).toMatchObject({ ownerReplacedById: dealer.userId, ownerReplacedRole: "dealer", layoutFixedAt: null, layoutIssueReason: null });
      expect(nb.ownerReplacedAt?.toISOString()).toBe(r.body.replacedAt);
      // Other lines untouched.
      expect((await line(o.banner)).productionStatus).toBe("PRINTING");
      expect((await line(o.mug)).ownerReplacedAt).toBeNull();
      await expectInvariant(o.id);
    });

    it("archive row with reason «owner_replace», the old file kept", async () => {
      const o = await mixedOrder(dealer);
      await setLines(o.id, [o.banner], "PRINTING");
      const old = (await line(o.notebook)).files[0]!;
      expect((await replace(o.id, o.notebook, replaceBody("nb-v2.png"), dealer)).status).toBe(200);
      const arch = await prisma.orderFileArchive.findMany({ where: { orderId: o.id } });
      expect(arch).toHaveLength(1);
      expect(arch[0]).toMatchObject({
        orderLineId: o.notebook,
        lineProductType: "notebook",
        fileName: old.fileName,
        fileUrl: old.fileUrl,
        copies: old.copies,
        reason: "owner_replace",
        archivedById: dealer.userId,
      });
    });

    it("dealerEditedAt set (the «Изменён дилером» badge) and the log `line_file_replaced` with the line code, by: owner", async () => {
      const o = await mixedOrder(dealer);
      await setLines(o.id, [o.banner], "PRINTING");
      expect((await orderRow(o.id)).dealerEditedAt).toBeNull();
      const r = await replace(o.id, o.notebook, replaceBody("nb-v2.png"), dealer);
      expect(r.status).toBe(200);
      expect((await orderRow(o.id)).dealerEditedAt?.toISOString()).toBe(r.body.replacedAt);
      const entries = await logs(o.id, "line_file_replaced");
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ userId: dealer.userId, field: "files", oldValue: "nb.png", newValue: "nb-v2.png" });
      expect(entries[0]!.metadata).toMatchObject({
        orderLineId: o.notebook,
        lineCode: code(o, 2),
        by: "owner",
        role: "dealer",
        lineStatus: "WAITING",
      });
      // No status logs: nothing changed status.
      expect(await logs(o.id, "line_status_changed")).toHaveLength(1); // only the banner → PRINTING
      expect((await logs(o.id, "status_changed")).filter((l) => (l.createdAt as Date) > new Date(r.body.replacedAt as string))).toHaveLength(0);
    });

    it("mug DONE (the others waiting) → replacing the notebook: 200", async () => {
      const o = await mixedOrder(dealer);
      await setLines(o.id, [o.mug], "DONE");
      expect((await orderRow(o.id)).status).toBe("WORKSHOP_PRINTING");
      const before = await snapshot(o.id);
      const r = await replace(o.id, o.notebook, replaceBody("nb-v2.png"), dealer);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(await snapshot(o.id)).toEqual(before);
      await expectInvariant(o.id);
    });

    it("banner PRINTING + mug DONE + notebook WAITING (the owner's scenario) → 200 on the notebook, 409 on the others", async () => {
      const o = await mixedOrder(dealer);
      await setLines(o.id, [o.banner], "PRINTING");
      await setLines(o.id, [o.mug], "DONE");
      expect((await replace(o.id, o.notebook, replaceBody("nb-v2.png"), dealer)).status).toBe(200);
      expect(await replace(o.id, o.banner, replaceBody("b.png"), dealer)).toMatchObject({ status: 409, body: { error: "line_started" } });
      expect(await replace(o.id, o.mug, replaceBody("m.png"), dealer)).toMatchObject({ status: 409, body: { error: "line_started" } });
      expect((await orderRow(o.id)).status).toBe("WORKSHOP_PRINTING");
      await expectInvariant(o.id);
    });

    it("all lines WAITING (nothing started) → 200; the order stays SENT_TO_WORKSHOP and editable", async () => {
      const o = await mixedOrder(dealer);
      expect((await replace(o.id, o.mug, replaceBody("mug-v2.png"), dealer)).status).toBe(200);
      expect((await orderRow(o.id)).status).toBe("SENT_TO_WORKSHOP");
      const d = await cabinetDetail(o.id, dealer);
      expect(d.body.dealerActions).toBe("editable");
    });

    it("a regular (non-dealer) client owner → 200, role «client», no «Изменён дилером»", async () => {
      const o = await mixedOrder(retail);
      await setLines(o.id, [o.banner], "PRINTING");
      const r = await replace(o.id, o.mug, replaceBody("mug-v2.png"), retail);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(await line(o.mug)).toMatchObject({ productionStatus: "WAITING", ownerReplacedRole: "client", ownerReplacedById: retail.userId });
      expect((await orderRow(o.id)).dealerEditedAt).toBeNull();
      expect((await logs(o.id, "line_file_replaced"))[0]!.metadata).toMatchObject({ by: "owner", role: "client" });
    });

    it("double replace: allowed twice, both previous files archived, the marker moves", async () => {
      const o = await mixedOrder(dealer);
      await setLines(o.id, [o.banner], "PRINTING");
      const r1 = await replace(o.id, o.notebook, replaceBody("nb-v2.png"), dealer);
      expect(r1.status).toBe(200);
      await new Promise((r) => setTimeout(r, 15));
      const r2 = await replace(o.id, o.notebook, replaceBody("nb-v3.png"), dealer);
      expect(r2.status).toBe(200);
      expect(new Date(r2.body.replacedAt as string).getTime()).toBeGreaterThan(new Date(r1.body.replacedAt as string).getTime());
      const arch = await prisma.orderFileArchive.findMany({ where: { orderId: o.id }, orderBy: { archivedAt: "asc" } });
      expect(arch.map((a) => [a.fileName, a.reason])).toEqual([
        ["nb.png", "owner_replace"],
        ["nb-v2.png", "owner_replace"],
      ]);
      expect((await line(o.notebook)).files.map((f) => f.fileName)).toEqual(["nb-v3.png"]);
      expect((await line(o.notebook)).ownerReplacedAt?.toISOString()).toBe(r2.body.replacedAt);
      expect(await logs(o.id, "line_file_replaced")).toHaveLength(2);
      await expectInvariant(o.id);
    });

    it("several new files in one request → 400 invalid_file (one file per replace), nothing changes", async () => {
      const o = await mixedOrder(dealer);
      const before = await snapshot(o.id);
      const r = await replace(
        o.id,
        o.mug,
        { kind: "replace", files: [{ fileName: "a.png", fileUrl: uploadKey("a.png") }, { fileName: "b.png", fileUrl: uploadKey("b.png") }] },
        dealer,
      );
      expect(r).toMatchObject({ status: 400, body: { error: "invalid_file", detail: "single_file" } });
      expect(await snapshot(o.id)).toEqual(before);
      expect((await line(o.mug)).files.map((f) => f.fileName)).toEqual(["mug.png"]);
      expect(await prisma.orderFileArchive.count({ where: { orderId: o.id } })).toBe(0);
      expect((await line(o.mug)).ownerReplacedAt).toBeNull();
    });

    it("a paid order: replace allowed (money does not move), whole-order edit still refused", async () => {
      const o = await mixedOrder(dealer);
      await prisma.order.update({ where: { id: o.id }, data: { isPaid: true, paidAt: new Date() } });
      const before = await snapshot(o.id);
      expect((await replace(o.id, o.mug, replaceBody("mug-v2.png"), dealer)).status).toBe(200);
      expect(await snapshot(o.id)).toEqual(before);
      expect(await dealerPut(o.id)).toMatchObject({ status: 409, body: { code: "order_locked", reason: "paid" } });
      expect(await dealerCancel(o.id)).toMatchObject({ status: 409, body: { code: "order_locked" } });
    });
  });

  // ─── 2. Started lines and impossible states ─────────────────────────────

  describe("started lines are refused with 409, nothing changes", () => {
    it("PRINTING line → 409 line_started", async () => {
      const o = await mixedOrder(dealer);
      await setLines(o.id, [o.banner], "PRINTING");
      const before = await snapshot(o.id);
      const bannerFiles = (await line(o.banner)).files;
      expect(await replace(o.id, o.banner, replaceBody("b2.png"), dealer)).toMatchObject({
        status: 409,
        body: { error: "line_started", detail: "PRINTING" },
      });
      expect(await snapshot(o.id)).toEqual(before);
      expect((await line(o.banner)).files.map((f) => f.id)).toEqual(bannerFiles.map((f) => f.id));
      expect(await prisma.orderFileArchive.count({ where: { orderId: o.id } })).toBe(0);
      expect(await logs(o.id, "line_file_replaced")).toHaveLength(0);
      expect((await orderRow(o.id)).dealerEditedAt).toBeNull();
    });

    it("DONE line → 409 line_started", async () => {
      const o = await mixedOrder(dealer);
      await setLines(o.id, [o.mug], "DONE");
      expect(await replace(o.id, o.mug, replaceBody("m2.png"), dealer)).toMatchObject({
        status: 409,
        body: { error: "line_started", detail: "DONE" },
      });
      expect(await prisma.orderFileArchive.count({ where: { orderId: o.id } })).toBe(0);
      expect((await line(o.mug)).ownerReplacedAt).toBeNull();
    });

    it("WORKSHOP_READY: derived only when every line is DONE, so no WAITING line exists; every replace → 409", async () => {
      const o = await mixedOrder(dealer);
      await setLines(o.id, [o.mug, o.notebook], "DONE");
      expect((await orderRow(o.id)).status).toBe("WORKSHOP_PRINTING");
      expect(deriveWorkshopOrderStatus([{ productionStatus: "DONE" }, { productionStatus: "WAITING" }])).toBe("WORKSHOP_PRINTING");
      await setLines(o.id, [o.banner], "DONE");
      expect((await orderRow(o.id)).status).toBe("WORKSHOP_READY");
      for (const l of [o.mug, o.notebook, o.banner]) {
        expect(await replace(o.id, l, replaceBody("x.png"), dealer)).toMatchObject({ status: 409, body: { error: "line_started" } });
      }
      await expectInvariant(o.id);
    });

    it("made orders (READY_IN_STUDIO, DELIVERED) → 409 (their lines follow as DONE)", async () => {
      for (const status of ["READY_IN_STUDIO", "DELIVERED"] as const) {
        const o = await mixedOrder(dealer);
        await setOrderStatus(o.id, status);
        const r = await replace(o.id, o.mug, replaceBody("x.png"), dealer);
        expect(r.status, status).toBe(409);
        expect(["line_started", "order_locked"]).toContain(r.body.error);
      }
    });

    it("studio phase (NEW, IN_PROGRESS) and ISSUE with a waiting line → 200", async () => {
      for (const status of ["NEW", "IN_PROGRESS", "ISSUE"] as const) {
        const o = await mixedOrder(dealer);
        await setOrderStatus(o.id, status, status === "ISSUE" ? { issueReason: "fileCorrupt" } : {});
        expect((await line(o.mug)).productionStatus, status).toBe("WAITING");
        const r = await replace(o.id, o.mug, replaceBody(`m-${status}.png`), dealer);
        expect(r.status, `${status}: ${JSON.stringify(r.body)}`).toBe(200);
        expect((await orderRow(o.id)).status).toBe(status);
        await expectInvariant(o.id);
      }
    });
  });

  // ─── 3. Who may ──────────────────────────────────────────────────────────

  describe("auth and ownership", () => {
    it("anonymous → 401", async () => {
      const o = await mixedOrder(dealer);
      expect((await replace(o.id, o.mug, replaceBody("x.png"), null)).status).toBe(401);
    });

    it("another client → 404 with the same body as a missing order; nothing changes", async () => {
      const o = await mixedOrder(dealer);
      await setLines(o.id, [o.banner], "PRINTING");
      const foreign = await replace(o.id, o.notebook, replaceBody("x.png"), stranger);
      const missing = await replace("00000000-0000-0000-0000-000000000000", o.notebook, replaceBody("x.png"), stranger);
      const foreignLine = await replace(o.id, "00000000-0000-0000-0000-000000000000", replaceBody("x.png"), dealer);
      expect(foreign).toEqual({ status: 404, body: { error: "Not found" } });
      expect(missing).toEqual(foreign);
      expect(foreignLine).toEqual(foreign);
      expect((await line(o.notebook)).files.map((f) => f.fileName)).toEqual(["nb.png"]);
    });

    it("a line of another order of the same owner → 404", async () => {
      const a = await mixedOrder(dealer);
      const b = await mixedOrder(dealer);
      expect((await replace(a.id, b.mug, replaceBody("x.png"), dealer)).status).toBe(404);
      expect((await line(b.mug)).files.map((f) => f.fileName)).toEqual(["mug.png"]);
    });

    it("a staff session in the cabinet → 401 (not a customer)", async () => {
      const o = await mixedOrder(dealer);
      expect((await replace(o.id, o.mug, replaceBody("x.png"), { token: staff.admin.token })).status).toBe(401);
      expect((await replace(o.id, o.mug, replaceBody("x.png"), { token: staff.workshop.token })).status).toBe(401);
    });

    it("a studio order without an owner → 404 for any customer", async () => {
      const o = await mixedOrder(null);
      expect((await replace(o.id, o.mug, replaceBody("x.png"), dealer)).status).toBe(404);
    });
  });

  describe("deleted, cancelled, shop orders", () => {
    it("trashed → 404", async () => {
      const o = await mixedOrder(dealer);
      await prisma.order.update({ where: { id: o.id }, data: { deletedAt: new Date() } });
      expect((await replace(o.id, o.mug, replaceBody("x.png"), dealer)).status).toBe(404);
      expect(await prisma.orderFileArchive.count({ where: { orderId: o.id } })).toBe(0);
    });

    it("cancelled by the dealer → 404", async () => {
      const o = await mixedOrder(dealer);
      expect((await dealerCancel(o.id)).status).toBe(200);
      expect((await orderRow(o.id)).cancelledAt).not.toBeNull();
      expect((await replace(o.id, o.mug, replaceBody("x.png"), dealer)).status).toBe(404);
    });

    it("cancelledAt set without deletedAt (defensive) → 404", async () => {
      const o = await mixedOrder(dealer);
      await prisma.order.update({ where: { id: o.id }, data: { cancelledAt: new Date() } });
      expect((await replace(o.id, o.mug, replaceBody("x.png"), dealer)).status).toBe(404);
    });

    it("shop order (paid, visible in the cabinet) → 409 order_locked, nothing changes", async () => {
      const o = await mixedOrder(retail);
      await prisma.order.update({ where: { id: o.id }, data: { source: "shop", paymentStatus: "paid", isPaid: true, paidAt: new Date() } });
      expect(await replace(o.id, o.mug, replaceBody("x.png"), retail)).toMatchObject({ status: 409, body: { error: "order_locked", detail: "shop" } });
      expect((await line(o.mug)).files.map((f) => f.fileName)).toEqual(["mug.png"]);
      const d = await cabinetDetail(o.id, retail);
      expect(d.status).toBe(200);
      expect((d.body.orderLines as Array<{ canReplaceFile: boolean }>).every((l) => l.canReplaceFile === false)).toBe(true);
    });
  });

  // ─── 4. Validation: uploads only, size check ────────────────────────────

  describe("files", () => {
    it("a link is refused (the cabinet flow allows uploads only) → 400, nothing changes", async () => {
      const o = await mixedOrder(dealer);
      for (const fileUrl of ["https://drive.google.com/file/d/abc/view", "http://example.com/x.png", "uploads/it-owr/not-a-key.png", "../uploads/x.png"]) {
        const r = await replace(o.id, o.mug, { kind: "replace", files: [{ fileName: "x.png", fileUrl }] }, dealer);
        expect(r.status, fileUrl).toBe(400);
      }
      expect((await line(o.mug)).files.map((f) => f.fileName)).toEqual(["mug.png"]);
    });

    it("bad bodies → 400 (no files, unknown kind, bad JSON)", async () => {
      const o = await mixedOrder(dealer);
      for (const body of [{ kind: "replace" }, { kind: "replace", files: [] }, { kind: "nope", files: [{ fileName: "x.png", fileUrl: uploadKey("x.png") }] }]) {
        expect((await replace(o.id, o.mug, body, dealer)).status, JSON.stringify(body)).toBe(400);
      }
      cookieJar.customer = dealer.token;
      expect((await replaceRoute(req(`/x`, "POST", "{bad"), lineCtx(o.id, o.mug))).status).toBe(400);
      cookieJar.customer = null;
    });

    it("large-format: artwork bigger than 50×70 → 422, nothing changes; a fitting one → 200, the banner stays WAITING", async () => {
      const o = await mixedOrder(dealer);
      await setLines(o.id, [o.mug], "PRINTING");
      const before = await snapshot(o.id);
      const big = await storePng("huge.png", 2400, 2400, 72); // 84.7 × 84.7 cm
      expect(await replace(o.id, o.banner, { kind: "replace", files: [{ fileName: "huge.png", fileUrl: big }] }, dealer)).toMatchObject({
        status: 422,
        body: { error: "artwork_larger_than_ordered", detail: "huge.png" },
      });
      expect(await snapshot(o.id)).toEqual(before);
      expect(await prisma.orderFileArchive.count({ where: { orderId: o.id } })).toBe(0);
      const fit = await storePng("fit.png", 1417, 1984, 72); // ≈ 50 × 70 cm
      const ok = await replace(o.id, o.banner, { kind: "replace", files: [{ fileName: "fit.png", fileUrl: fit }] }, dealer);
      expect(ok.status, JSON.stringify(ok.body)).toBe(200);
      expect(await snapshot(o.id)).toEqual(before);
      expect((await line(o.banner)).files.map((f) => f.fileUrl)).toEqual([fit]);
      expect((await prisma.orderFileArchive.findMany({ where: { orderId: o.id } })).map((a) => [a.lineProductType, a.reason])).toEqual([
        ["large_format_print", "owner_replace"],
      ]);
    });
  });

  // ─── 5. Races ────────────────────────────────────────────────────────────

  describe("races", () => {
    const actor = (p: Party) => ({ userId: p.userId, studioCustomerId: p.customerId });
    const files = (n: string) => [{ fileName: n, fileUrl: uploadKey(n) }];

    it("the workshop marks the line PRINTING just before the lock → 409 line_started, nothing changed", async () => {
      const o = await mixedOrder(dealer);
      await setLines(o.id, [o.banner], "PRINTING");
      const nbBefore = await line(o.notebook);
      const err = await ownerReplaceLineFile(prisma, {
        orderId: o.id,
        lineId: o.notebook,
        actor: actor(dealer),
        files: files("late.png"),
        hooks: { beforeLock: async () => void (await setLines(o.id, [o.notebook], "PRINTING")) },
      }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(LayoutIssueError);
      expect((err as LayoutIssueError).code).toBe("line_started");
      expect((err as LayoutIssueError).httpStatus).toBe(409);
      const nb = await line(o.notebook);
      expect(nb.productionStatus).toBe("PRINTING");
      expect(nb.files.map((f) => f.id)).toEqual(nbBefore.files.map((f) => f.id));
      expect(nb.ownerReplacedAt).toBeNull();
      expect(await prisma.orderFileArchive.count({ where: { orderId: o.id } })).toBe(0);
      expect(await logs(o.id, "line_file_replaced")).toHaveLength(0);
      expect((await orderRow(o.id)).dealerEditedAt).toBeNull();
      await expectInvariant(o.id);
    });

    it("the line turns DONE just before the lock → 409 line_started", async () => {
      const o = await mixedOrder(dealer);
      const err = await ownerReplaceLineFile(prisma, {
        orderId: o.id,
        lineId: o.mug,
        actor: actor(dealer),
        files: files("late.png"),
        hooks: { beforeLock: async () => void (await setLines(o.id, [o.mug], "DONE")) },
      }).catch((e: unknown) => e);
      expect((err as LayoutIssueError).code).toBe("line_started");
      expect((await line(o.mug)).files.map((f) => f.fileName)).toEqual(["mug.png"]);
    });

    it("the order is trashed just before the lock → 404, nothing changed", async () => {
      const o = await mixedOrder(dealer);
      const err = await ownerReplaceLineFile(prisma, {
        orderId: o.id,
        lineId: o.mug,
        actor: actor(dealer),
        files: files("late.png"),
        hooks: { beforeLock: async () => void (await prisma.order.update({ where: { id: o.id }, data: { deletedAt: new Date() } })) },
      }).catch((e: unknown) => e);
      expect((err as LayoutIssueError).code).toBe("order_not_found");
      expect(await prisma.orderFileArchive.count({ where: { orderId: o.id } })).toBe(0);
    });

    it("the replace holds the lock while the workshop starts the line → the start waits; the file is replaced first, then PRINTING", async () => {
      const o = await mixedOrder(dealer);
      let startP: Promise<Res> | null = null;
      await ownerReplaceLineFile(prisma, {
        orderId: o.id,
        lineId: o.notebook,
        actor: actor(dealer),
        files: files("first.png"),
        hooks: {
          afterLock: async () => {
            startP = setLines(o.id, [o.notebook], "PRINTING");
            await new Promise((r) => setTimeout(r, 150));
          },
        },
      });
      await startP;
      const nb = await line(o.notebook);
      expect(nb.productionStatus).toBe("PRINTING");
      expect(nb.files.map((f) => f.fileName)).toEqual(["first.png"]);
      await expectInvariant(o.id);
    });

    it("the workshop flags «Нужен макет» just before the lock → the replace becomes the layout fix (WAITING, layoutFixedAt)", async () => {
      const o = await mixedOrder(dealer);
      const res = await ownerReplaceLineFile(prisma, {
        orderId: o.id,
        lineId: o.mug,
        actor: actor(dealer),
        files: files("fixed.png"),
        hooks: { beforeLock: async () => void (await flag(o.id, o.mug)) },
      });
      expect(res.kind).toBe("layout_fix");
      const m = await line(o.mug);
      expect(m).toMatchObject({ productionStatus: "WAITING", layoutIssueReason: null, layoutFixedById: dealer.userId, ownerReplacedAt: null });
      expect((await prisma.orderFileArchive.findMany({ where: { orderId: o.id } })).map((a) => a.reason)).toEqual(["layout_issue"]);
    });

    it("two concurrent replaces of the same waiting line: both succeed in turn, two archive rows, consistent files", async () => {
      const o = await mixedOrder(dealer);
      const [a, b] = await Promise.allSettled([
        ownerReplaceLineFile(prisma, { orderId: o.id, lineId: o.notebook, actor: actor(dealer), files: files("p1.png") }),
        ownerReplaceLineFile(prisma, { orderId: o.id, lineId: o.notebook, actor: actor(dealer), files: files("p2.png") }),
      ]);
      expect(a.status).toBe("fulfilled");
      expect(b.status).toBe("fulfilled");
      const nb = await line(o.notebook);
      expect(nb.files).toHaveLength(1);
      expect(["p1.png", "p2.png"]).toContain(nb.files[0]!.fileName);
      expect(await prisma.orderFileArchive.count({ where: { orderId: o.id } })).toBe(2);
    });
  });

  // ─── 6. Regressions ──────────────────────────────────────────────────────

  describe("regressions", () => {
    it("NEEDS_LAYOUT via kind=replace still auto-returns to WAITING (layout fix, layout_issue archive, line_layout_fixed)", async () => {
      const o = await mixedOrder(dealer);
      await setLines(o.id, [o.banner], "PRINTING");
      await flag(o.id, o.mug);
      const r = await replace(o.id, o.mug, replaceBody("mug-fixed.png"), dealer);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body).toMatchObject({ kind: "layout_fix", lineStatus: "WAITING", replacedAt: null });
      const m = await line(o.mug);
      expect(m).toMatchObject({ productionStatus: "WAITING", layoutIssueReason: null, layoutFixedById: dealer.userId, ownerReplacedAt: null });
      expect((await prisma.orderFileArchive.findMany({ where: { orderId: o.id } })).map((a) => a.reason)).toEqual(["layout_issue"]);
      expect(await logs(o.id, "line_layout_fixed")).toHaveLength(1);
      expect(await logs(o.id, "line_file_replaced")).toHaveLength(0);
      await expectInvariant(o.id);
    });

    it("NEEDS_LAYOUT via the default (layout) body keeps working, and a WAITING line there is still 409 line_not_flagged", async () => {
      const o = await mixedOrder(retail);
      await flag(o.id, o.notebook);
      const ok = await replace(o.id, o.notebook, { files: [{ fileName: "f.png", fileUrl: uploadKey("f.png") }] }, retail);
      expect(ok.status).toBe(200);
      expect((await line(o.notebook)).productionStatus).toBe("WAITING");
      expect(await replace(o.id, o.mug, { files: [{ fileName: "g.png", fileUrl: uploadKey("g.png") }] }, retail)).toMatchObject({
        status: 409,
        body: { error: "line_not_flagged" },
      });
      expect((await line(o.mug)).files.map((f) => f.fileName)).toEqual(["mug.png"]);
    });

    it("whole-order edit and cancel are still refused while any line is PRINTING — even after a file replace", async () => {
      const o = await mixedOrder(dealer);
      await setLines(o.id, [o.banner], "PRINTING");
      expect(await dealerPut(o.id)).toMatchObject({ status: 409, body: { code: "order_locked" } });
      expect(await dealerCancel(o.id)).toMatchObject({ status: 409, body: { code: "order_locked" } });
      expect((await replace(o.id, o.notebook, replaceBody("nb-v2.png"), dealer)).status).toBe(200);
      expect(await dealerPut(o.id)).toMatchObject({ status: 409, body: { code: "order_locked" } });
      expect(await dealerCancel(o.id)).toMatchObject({ status: 409, body: { code: "order_locked" } });
      const o2 = await orderRow(o.id);
      expect(o2.deletedAt).toBeNull();
      expect(o2.cancelledAt).toBeNull();
      expect((await lines(o.id))[0]!.files[0]!.copies).toBe(2);
    });

    it("whole-order edit still works on an all-WAITING order after a file replace (replace does not lock it)", async () => {
      const o = await mixedOrder(dealer);
      expect((await replace(o.id, o.notebook, replaceBody("nb-v2.png"), dealer)).status).toBe(200);
      const d = await cabinetDetail(o.id, dealer);
      expect(d.body).toMatchObject({ dealerActions: "editable", dealerLockReason: null });
    });
  });

  // ─── 7. Read side: cabinet detail / list, staff lists, board ────────────

  describe("read side", () => {
    it("cabinet detail: per-line statuses + canReplaceFile + ownerReplacedAt, no cost fields, no staff ids", async () => {
      const o = await mixedOrder(dealer);
      await setLines(o.id, [o.banner], "PRINTING");
      await setLines(o.id, [o.mug], "DONE");
      expect((await replace(o.id, o.notebook, replaceBody("nb-v2.png"), dealer)).status).toBe(200);
      const d = await cabinetDetail(o.id, dealer);
      expect(d.status).toBe(200);
      const ls = d.body.orderLines as Array<Record<string, unknown>>;
      expect(ls.map((l) => [l.id, l.productionStatus, l.canReplaceFile])).toEqual([
        [o.mug, "DONE", false],
        [o.notebook, "WAITING", true],
        [o.banner, "PRINTING", false],
      ]);
      expect(typeof ls[1]!.ownerReplacedAt).toBe("string");
      expect(ls[0]!.ownerReplacedAt).toBeNull();
      expect(costKeyPaths(d.body)).toEqual([]);
      const json = JSON.stringify(d.body);
      expect(json).not.toContain(staff.workshop.id);
      expect(json).not.toContain("ownerReplacedById");
      expect(json).not.toContain("ownerReplacedRole");
      expect(d.body).toMatchObject({ dealerActions: "locked", dealerLockReason: "printing" });
    });

    it("cabinet detail: a flagged line is not «canReplaceFile» (its own «Нужен макет» button), a cancelled order has no statuses", async () => {
      const o = await mixedOrder(dealer);
      await flag(o.id, o.mug);
      const d = await cabinetDetail(o.id, dealer);
      const ls = d.body.orderLines as Array<Record<string, unknown>>;
      expect(ls[0]).toMatchObject({ productionStatus: "NEEDS_LAYOUT", canReplaceFile: false });
      expect(ls[1]).toMatchObject({ productionStatus: "WAITING", canReplaceFile: true });

      const c = await mixedOrder(dealer);
      expect((await dealerCancel(c.id)).status).toBe(200);
      const dc = await cabinetDetail(c.id, dealer);
      expect(dc.status).toBe(200);
      expect((dc.body.orderLines as Array<Record<string, unknown>>).every((l) => l.productionStatus === null && l.canReplaceFile === false)).toBe(true);
    });

    it("cabinet list: «Готово N из M» (linesDone) only while mixed; no leak to another client", async () => {
      const o = await mixedOrder(dealer);
      await setLines(o.id, [o.banner], "PRINTING");
      await setLines(o.id, [o.mug], "DONE");
      const mine = await cabinetList(dealer);
      expect(mine.status).toBe(200);
      const row = (mine.body.orders as Array<Record<string, unknown>>).find((x) => x.id === o.id);
      expect(row?.linesDone).toEqual({ done: 1, total: 3 });
      expect(costKeyPaths(mine.body)).toEqual([]);

      const theirs = await cabinetList(stranger);
      expect(theirs.status).toBe(200);
      expect((theirs.body.orders as Array<{ id: string }>).some((x) => x.id === o.id)).toBe(false);
      expect(JSON.stringify(theirs.body)).not.toContain(o.id);

      const fresh = await mixedOrder(dealer);
      const again = await cabinetList(dealer);
      expect((again.body.orders as Array<Record<string, unknown>>).find((x) => x.id === fresh.id)?.linesDone).toBeNull();
    });

    it("another client's detail → 404 even after a replace", async () => {
      const o = await mixedOrder(dealer);
      expect((await replace(o.id, o.notebook, replaceBody("nb-v2.png"), dealer)).status).toBe(200);
      expect((await cabinetDetail(o.id, stranger)).status).toBe(404);
    });

    it("staff orders list: the marker is selected and the poll fingerprint changes on a replace (status unchanged)", async () => {
      const o = await mixedOrder(dealer);
      await setLines(o.id, [o.banner], "PRINTING");
      const user = { id: staff.admin.id, name: "a", role: "admin" };
      const row = async () => {
        const d = await fetchOrdersData(user, { search: String(o.orderNumber), limit: 50 });
        const rows = JSON.parse(JSON.stringify(d.orders)) as Array<PollFingerprintOrder & { orderLines: Array<Record<string, unknown>> }>;
        return rows.find((r) => r.id === o.id)!;
      };
      const before = await row();
      expect(before).toBeTruthy();
      const f0 = orderPollFingerprint([before]);
      expect((await replace(o.id, o.notebook, replaceBody("nb-v2.png"), dealer)).status).toBe(200);
      const after = await row();
      expect(after.status).toBe(before.status);
      const nb = after.orderLines.find((l) => l.id === o.notebook)!;
      expect(nb).toMatchObject({ productionStatus: "WAITING", ownerReplacedRole: "dealer" });
      expect(typeof nb.ownerReplacedAt).toBe("string");
      expect(orderPollFingerprint([after])).not.toBe(f0);
      // A second replace moves it again.
      await new Promise((r) => setTimeout(r, 10));
      expect((await replace(o.id, o.notebook, replaceBody("nb-v3.png"), dealer)).status).toBe(200);
      expect(orderPollFingerprint([await row()])).not.toBe(orderPollFingerprint([after]));
    });

    it("ЦЕХ sidebar: the marker is selected for the notebook line", async () => {
      const o = await mixedOrder(retail);
      await setLines(o.id, [o.banner], "PRINTING");
      expect((await replace(o.id, o.notebook, replaceBody("nb-v2.png"), retail)).status).toBe(200);
      const user = { id: staff.admin.id, name: "a", role: "admin" };
      const d = await fetchWorkshopSidebarData(user, { search: String(o.orderNumber) });
      const rows = JSON.parse(JSON.stringify(d.workshopOrders)) as Array<{ id: string; orderLines: Array<Record<string, unknown>> }>;
      const row = rows.find((r) => r.id === o.id);
      expect(row, "order in the ЦЕХ sidebar").toBeTruthy();
      const nb = row!.orderLines.find((l) => l.id === o.notebook)!;
      expect(nb.ownerReplacedRole).toBe("client");
      expect(typeof nb.ownerReplacedAt).toBe("string");
      expect(row!.orderLines.find((l) => l.id === o.banner)!.ownerReplacedAt).toBeNull();
    });

    it("workshop board: the notebook line carries ownerReplacedAt + role «dealer» + dealerEditedAt; the banner not", async () => {
      const o = await mixedOrder(dealer);
      await setLines(o.id, [o.banner], "PRINTING");
      expect((await replace(o.id, o.notebook, replaceBody("nb-v2.png"), dealer)).status).toBe(200);
      const board = await fetchWorkshopBoardData({ id: staff.workshop.id, name: "w", role: "workshop" }, { search: phone });
      const found: Array<Record<string, unknown>> = [];
      const walk = (v: unknown) => {
        if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === "object") {
          const r = v as Record<string, unknown>;
          if (r.orderLineId === o.notebook || r.orderLineId === o.banner) found.push(r);
          Object.values(r).forEach(walk);
        }
      };
      walk(JSON.parse(JSON.stringify(board)));
      const nbLine = found.find((l) => l.orderLineId === o.notebook);
      const bnLine = found.find((l) => l.orderLineId === o.banner);
      expect(nbLine, "notebook on the board").toBeTruthy();
      expect(bnLine, "banner on the board").toBeTruthy();
      expect(nbLine!.ownerReplacedRole).toBe("dealer");
      expect(typeof nbLine!.ownerReplacedAt).toBe("string");
      expect(typeof nbLine!.dealerEditedAt).toBe("string");
      expect(bnLine!.ownerReplacedAt ?? null).toBeNull();
    });
  });

  // ─── 8. Audit: upload-key scope, multi-file, more races, staff flag after a replace ──

  describe("audit: upload key scope (only server-built order upload keys)", () => {
    it("catalog / nested / traversal / foreign-scheme / malformed keys → 400, nothing changes, nothing logged", async () => {
      const o = await mixedOrder(dealer);
      const ts = Date.now();
      const bad = [
        `catalog/mugs/${ts}-abcdefgh-x.png`,
        `catalog/stock/${ts}-abcdefgh-x.png`,
        `catalog/design-assets/${ts}-abcdefgh-x.png`,
        `/uploads/${ts}-abcdefgh-x.png`,
        `UPLOADS/${ts}-abcdefgh-x.png`,
        `uploads/sub/${ts}-abcdefgh-x.png`,
        `uploads/${ts}-abcdefgh-../../catalog/x.png`,
        `uploads/${ts}-abcdefgh-..\\..\\x.png`,
        `uploads/${ts}-abcdefgh-a\u0000.png`,
        `uploads/${ts}-abcdefgh-a\n.png`,
        `uploads/${ts}-abcdefgh-`,
        `uploads/123-abcdefgh-x.png`,
        `uploads/${ts}-abc-x.png`,
        `uploads/${ts}-abcdefgh-${"a".repeat(201)}`,
        ` uploads/${ts}-abcdefgh-x.png`,
        `uploads/${ts}-abcdefgh-x.png/`,
        "file:///etc/passwd",
        "s3://uploads/x.png",
        "data:image/png;base64,AAAA",
        "javascript:alert(1)",
        "",
      ];
      for (const fileUrl of bad) {
        const r = await replace(o.id, o.mug, { kind: "replace", files: [{ fileName: "x.png", fileUrl }] }, dealer);
        expect(r.status, JSON.stringify(fileUrl)).toBe(400);
      }
      // One bad key among good ones spoils the whole request.
      const mixed = await replace(
        o.id,
        o.mug,
        { kind: "replace", files: [{ fileName: "ok.png", fileUrl: uploadKey("ok.png") }, { fileName: "x.png", fileUrl: "catalog/mugs/x.png" }] },
        dealer,
      );
      expect(mixed.status).toBe(400);
      expect((await line(o.mug)).files.map((f) => f.fileName)).toEqual(["mug.png"]);
      expect(await prisma.orderFileArchive.count({ where: { orderId: o.id } })).toBe(0);
      expect(await logs(o.id, "line_file_replaced")).toHaveLength(0);
      expect((await orderRow(o.id)).dealerEditedAt).toBeNull();
    });

    it("the core refuses a bad key before any read (direct call, no route)", async () => {
      const o = await mixedOrder(dealer);
      for (const fileUrl of ["catalog/mugs/1-abcdefgh-x.png", "https://x.test/a.png", "uploads/../x"]) {
        const err = await ownerReplaceLineFile(prisma, {
          orderId: o.id,
          lineId: o.mug,
          actor: { userId: dealer.userId, studioCustomerId: dealer.customerId },
          files: [{ fileName: "x.png", fileUrl }],
        }).catch((e: unknown) => e);
        expect((err as LayoutIssueError).code, fileUrl).toBe("invalid_file");
      }
      // Even for a stranger the answer is invalid_file (no order lookup happens first, no existence leak).
      const err = await ownerReplaceLineFile(prisma, {
        orderId: o.id,
        lineId: o.mug,
        actor: { userId: stranger.userId, studioCustomerId: stranger.customerId },
        files: [{ fileName: "x.png", fileUrl: "catalog/x" }],
      }).catch((e: unknown) => e);
      expect((err as LayoutIssueError).code).toBe("invalid_file");
    });

    it("the key is stored verbatim; the display name loses control characters and <>\"", async () => {
      const o = await mixedOrder(dealer);
      const key = uploadKey("new.png");
      const r = await replace(o.id, o.mug, { kind: "replace", files: [{ fileName: " <b>\"ma\u0007ket\".png ", fileUrl: key }] }, dealer);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      const f = (await line(o.mug)).files[0]!;
      expect(f.fileUrl).toBe(key);
      expect(f.fileName).toBe("bmaket.png");
      expect(f.fileName).not.toMatch(/[\u0000-\u001f<>"]/);
    });

    it("more than 20 files or an over-long file name → 400", async () => {
      const o = await mixedOrder(dealer);
      const many = Array.from({ length: 21 }, (_, i) => ({ fileName: `f${i}.png`, fileUrl: uploadKey(`f${i}.png`) }));
      expect((await replace(o.id, o.mug, { kind: "replace", files: many }, dealer)).status).toBe(400);
      expect(
        (await replace(o.id, o.mug, { kind: "replace", files: [{ fileName: "x".repeat(5000), fileUrl: uploadKey("x.png") }] }, dealer)).status,
      ).toBe(400);
      expect((await replace(o.id, o.mug, { kind: "replace", files: [{ fileName: "x.png" }] }, dealer)).status).toBe(400);
      expect((await line(o.mug)).files.map((f) => f.fileName)).toEqual(["mug.png"]);
    });
  });

  describe("audit: lines with several files", () => {
    /** Turns the mug line into a 3-file line (copies 2 / 3 / 5, mixed colour and pages). */
    async function threeFiles(o: MixedOrder) {
      await prisma.file.createMany({
        data: [
          { orderId: o.id, orderLineId: o.mug, fileName: "mug2.png", fileUrl: uploadKey("mug2.png"), copies: 3, color: "bw", pageCount: 4 },
          { orderId: o.id, orderLineId: o.mug, fileName: "mug3.png", fileUrl: uploadKey("mug3.png"), copies: 5, color: "color", paperType: "matte" },
        ],
      });
      const fs = (await line(o.mug)).files.sort((a, b) => a.fileName.localeCompare(b.fileName));
      return fs.map((f) => [f.copies, f.color, f.pageCount, f.paperType]);
    }
    const qty = async (lineId: string) => (await line(lineId)).files.reduce((s, f) => s + f.copies, 0);

    it("3 files: replacing the middle one keeps the other two and every copy count (quantity stays 10)", async () => {
      const o = await mixedOrder(dealer);
      const attrs = await threeFiles(o);
      expect(await qty(o.mug)).toBe(10);
      const before = await snapshot(o.id);
      const old = (await line(o.mug)).files.sort((a, b) => a.fileName.localeCompare(b.fileName));
      // A new name that sorts in the same place, so the by-position snapshot compares like with like.
      const r = await replace(o.id, o.mug, { ...replaceBody("mug2-v2.png"), fileId: old[1]!.id }, dealer);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(await snapshot(o.id)).toEqual(before);
      expect(await qty(o.mug)).toBe(10);
      const fs = (await line(o.mug)).files.sort((a, b) => a.fileName.localeCompare(b.fileName));
      expect(fs.map((f) => f.fileName)).toEqual(["mug.png", "mug2-v2.png", "mug3.png"]);
      // The new file carries the replaced one's copies / colour / pages / paper.
      const n2 = fs.find((f) => f.fileName === "mug2-v2.png")!;
      expect([n2.copies, n2.color, n2.pageCount, n2.paperType]).toEqual(attrs[1]);
      // The two others are the same rows.
      expect(fs.filter((f) => f.fileName !== "mug2-v2.png").map((f) => f.id).sort()).toEqual([old[0]!.id, old[2]!.id].sort());
      const arch = await prisma.orderFileArchive.findMany({ where: { orderId: o.id } });
      expect(arch.map((a) => [a.fileName, a.copies, a.reason])).toEqual([["mug2.png", 3, "owner_replace"]]);
      await expectInvariant(o.id);
    });

    it("3 files, several new files at once → 400 invalid_file, all 3 files kept", async () => {
      const o = await mixedOrder(dealer);
      await threeFiles(o);
      const ids = (await line(o.mug)).files.map((f) => f.id).sort();
      const r = await replace(
        o.id,
        o.mug,
        { kind: "replace", files: ["n1.png", "n2.png", "n3.png"].map((n) => ({ fileName: n, fileUrl: uploadKey(n) })) },
        dealer,
      );
      expect(r).toMatchObject({ status: 400, body: { error: "invalid_file", detail: "single_file" } });
      expect((await line(o.mug)).files.map((f) => f.id).sort()).toEqual(ids);
      expect(await prisma.orderFileArchive.count({ where: { orderId: o.id } })).toBe(0);
    });

    it("3 files without fileId: 400 file_id_required, all 3 files and the quantity kept", async () => {
      const o = await mixedOrder(dealer);
      await threeFiles(o);
      const ids = (await line(o.mug)).files.map((f) => f.id).sort();
      const r = await replace(o.id, o.mug, replaceBody("one.png"), dealer);
      expect(r).toMatchObject({ status: 400, body: { error: "file_id_required", detail: "3" } });
      expect((await line(o.mug)).files.map((f) => f.id).sort()).toEqual(ids);
      expect(await qty(o.mug)).toBe(10);
      expect(await prisma.orderFileArchive.count({ where: { orderId: o.id } })).toBe(0);
      expect(await logs(o.id, "line_file_replaced")).toHaveLength(0);
    });

    it("the board quantity of a 1-file line cannot be multiplied by sending N files (2 mugs stay 2)", async () => {
      const o = await mixedOrder(dealer);
      const five = Array.from({ length: 5 }, (_, i) => ({ fileName: `m${i}.png`, fileUrl: uploadKey(`m${i}.png`) }));
      expect((await replace(o.id, o.mug, { kind: "replace", files: five }, dealer)).status).toBe(400);
      expect(await qty(o.mug)).toBe(2);
    });

    it("cabinet detail: «Заменить» on every waiting line with files (any count), not on a file-less one", async () => {
      const o = await mixedOrder(dealer);
      await threeFiles(o);
      await prisma.file.deleteMany({ where: { orderLineId: o.banner } });
      const d = await cabinetDetail(o.id, dealer);
      const ls = d.body.orderLines as Array<Record<string, unknown>>;
      expect(ls.map((l) => [l.id, l.productionStatus, l.canReplaceFile])).toEqual([
        [o.mug, "WAITING", true],
        [o.notebook, "WAITING", true],
        [o.banner, "WAITING", false],
      ]);
      // A file-less line cannot get one through «replace» either (nothing to replace).
      expect(await replace(o.id, o.banner, replaceBody("b.png"), dealer)).toMatchObject({ status: 404, body: { error: "file_not_in_line", detail: "0" } });
      expect((await line(o.banner)).files).toHaveLength(0);
    });

    it("the files are re-read under the lock: staff adds a file meanwhile → no fileId is now ambiguous (400), nothing changes", async () => {
      const o = await mixedOrder(dealer);
      const err = await ownerReplaceLineFile(prisma, {
        orderId: o.id,
        lineId: o.notebook,
        actor: { userId: dealer.userId, studioCustomerId: dealer.customerId },
        files: [{ fileName: "late.png", fileUrl: uploadKey("late.png") }],
        hooks: {
          beforeLock: async () =>
            void (await prisma.file.create({
              data: { orderId: o.id, orderLineId: o.notebook, fileName: "extra.png", fileUrl: uploadKey("extra.png"), copies: 1, color: "color" },
            })),
        },
      }).catch((e: unknown) => e);
      expect((err as LayoutIssueError).code).toBe("file_id_required");
      expect((await line(o.notebook)).files.map((f) => f.fileName).sort()).toEqual(["extra.png", "nb.png"]);
      expect((await line(o.notebook)).ownerReplacedAt).toBeNull();
      // Naming the file works and leaves the added one alone.
      const nb = (await line(o.notebook)).files.find((f) => f.fileName === "nb.png")!;
      const ok = await ownerReplaceLineFile(prisma, {
        orderId: o.id,
        lineId: o.notebook,
        actor: { userId: dealer.userId, studioCustomerId: dealer.customerId },
        fileId: nb.id,
        files: [{ fileName: "late.png", fileUrl: uploadKey("late.png") }],
      });
      expect(ok.replaced).toMatchObject({ oldFileId: nb.id, oldFileName: "nb.png", newFileName: "late.png" });
      expect((await line(o.notebook)).files.map((f) => f.fileName).sort()).toEqual(["extra.png", "late.png"]);
    });
  });

  describe("audit: more races and ownership edges", () => {
    const actor = (p: Party) => ({ userId: p.userId, studioCustomerId: p.customerId });
    const files = (n: string) => [{ fileName: n, fileUrl: uploadKey(n) }];
    async function expectUntouched(o: MixedOrder, lineId: string, fileName: string) {
      const l = await line(lineId);
      expect(l.files.map((f) => f.fileName)).toEqual([fileName]);
      expect(l.ownerReplacedAt).toBeNull();
      expect(await prisma.orderFileArchive.count({ where: { orderId: o.id } })).toBe(0);
      expect(await logs(o.id, "line_file_replaced")).toHaveLength(0);
      expect((await orderRow(o.id)).dealerEditedAt).toBeNull();
    }

    it("the order is cancelled just before the lock → 404, nothing changed", async () => {
      const o = await mixedOrder(dealer);
      const err = await ownerReplaceLineFile(prisma, {
        orderId: o.id,
        lineId: o.mug,
        actor: actor(dealer),
        files: files("late.png"),
        hooks: { beforeLock: async () => void (await prisma.order.update({ where: { id: o.id }, data: { cancelledAt: new Date() } })) },
      }).catch((e: unknown) => e);
      expect((err as LayoutIssueError).code).toBe("order_not_found");
      await expectUntouched(o, o.mug, "mug.png");
    });

    it("the order is handed to another client just before the lock → 404 for the old owner, nothing changed", async () => {
      const o = await mixedOrder(dealer);
      const err = await ownerReplaceLineFile(prisma, {
        orderId: o.id,
        lineId: o.mug,
        actor: actor(dealer),
        files: files("late.png"),
        hooks: { beforeLock: async () => void (await prisma.order.update({ where: { id: o.id }, data: { clientId: stranger.customerId } })) },
      }).catch((e: unknown) => e);
      expect((err as LayoutIssueError).code).toBe("order_not_found");
      await expectUntouched(o, o.mug, "mug.png");
    });

    it("the order moves to READY_IN_STUDIO just before the lock → 409 order_locked / line_started, nothing changed", async () => {
      const o = await mixedOrder(dealer);
      const err = await ownerReplaceLineFile(prisma, {
        orderId: o.id,
        lineId: o.mug,
        actor: actor(dealer),
        files: files("late.png"),
        hooks: { beforeLock: async () => void (await prisma.order.update({ where: { id: o.id }, data: { status: "READY_IN_STUDIO" } })) },
      }).catch((e: unknown) => e);
      expect((err as LayoutIssueError).code).toBe("order_locked");
      expect((err as LayoutIssueError).httpStatus).toBe(409);
      await expectUntouched(o, o.mug, "mug.png");
      // Raw status write above: put it back so the suite-wide invariant check stays meaningful.
      await prisma.order.update({ where: { id: o.id }, data: { status: "SENT_TO_WORKSHOP" } });
    });

    it("the line is moved out of the order just before the lock → 404", async () => {
      const o = await mixedOrder(dealer);
      const other = await mixedOrder(dealer);
      const err = await ownerReplaceLineFile(prisma, {
        orderId: o.id,
        lineId: o.mug,
        actor: actor(dealer),
        files: files("late.png"),
        hooks: { beforeLock: async () => void (await prisma.orderLine.update({ where: { id: o.mug }, data: { orderId: other.id } })) },
      }).catch((e: unknown) => e);
      expect((err as LayoutIssueError).code).toBe("order_not_found");
      await prisma.orderLine.update({ where: { id: o.mug }, data: { orderId: o.id } });
      await expectUntouched(o, o.mug, "mug.png");
    });

    it("staff flags + replaces the file just before the owner's lock → the owner's replace runs on top (serialised, consistent)", async () => {
      const o = await mixedOrder(dealer);
      const res = await ownerReplaceLineFile(prisma, {
        orderId: o.id,
        lineId: o.notebook,
        actor: actor(dealer),
        files: files("owner.png"),
        hooks: {
          beforeLock: async () => {
            await flag(o.id, o.notebook);
            cookieJar.admin = staff.admin.token;
            const r = await read(await staffReplaceRoute(req(`/x`, "POST", { files: files("staff.png") }), lineCtx(o.id, o.notebook)));
            cookieJar.admin = null;
            expect(r.status, JSON.stringify(r.body)).toBe(200);
          },
        },
      });
      expect(res.kind).toBe("replace");
      const nb = await line(o.notebook);
      expect(nb.files.map((f) => f.fileName)).toEqual(["owner.png"]);
      expect(nb.productionStatus).toBe("WAITING");
      expect(nb.ownerReplacedRole).toBe("dealer");
      const arch = await prisma.orderFileArchive.findMany({ where: { orderId: o.id }, orderBy: { archivedAt: "asc" } });
      expect(arch.map((a) => [a.fileName, a.reason])).toEqual([
        ["nb.png", "layout_issue"],
        ["staff.png", "owner_replace"],
      ]);
      await expectInvariant(o.id);
    });

    it("owner replace and a staff replace of the same line at the same time → serialised, one file, both archived", async () => {
      const o = await mixedOrder(dealer);
      await flag(o.id, o.notebook);
      cookieJar.admin = staff.admin.token;
      const [own, stf] = await Promise.allSettled([
        ownerReplaceLineFile(prisma, { orderId: o.id, lineId: o.notebook, actor: actor(dealer), files: files("owner.png") }),
        staffReplaceRoute(req(`/x`, "POST", { files: files("staff.png") }), lineCtx(o.id, o.notebook)).then(read),
      ]);
      cookieJar.admin = null;
      expect(own.status).toBe("fulfilled");
      expect(stf.status).toBe("fulfilled");
      const nb = await line(o.notebook);
      expect(nb.productionStatus).toBe("WAITING");
      expect(nb.files).toHaveLength(1);
      // Whoever came second either replaced on top (200) or found the line no longer flagged (409).
      const staffStatus = (stf as PromiseFulfilledResult<Res>).value.status;
      expect([200, 409]).toContain(staffStatus);
      await expectInvariant(o.id);
    });

    it("a customer account without a studio customer → 401; my order + a stranger's line id → 404", async () => {
      const lone = await prisma.user.create({
        data: { name: `it-ownrep-lone-${stamp}@anvi.test`, role: "customer", password: hashPassword("x") },
      });
      try {
        const o = await mixedOrder(dealer);
        expect((await replace(o.id, o.mug, replaceBody("x.png"), { token: await createSession(lone.id) })).status).toBe(401);
        const theirs = await mixedOrder(stranger);
        expect(await replace(o.id, theirs.mug, replaceBody("x.png"), dealer)).toMatchObject({ status: 404, body: { error: "Not found" } });
        expect(await replace(theirs.id, theirs.mug, replaceBody("x.png"), dealer)).toMatchObject({ status: 404, body: { error: "Not found" } });
        expect(await replace("not-a-uuid", "nope", replaceBody("x.png"), dealer)).toMatchObject({ status: 404 });
        expect((await line(theirs.mug)).files.map((f) => f.fileName)).toEqual(["mug.png"]);
      } finally {
        await prisma.session.deleteMany({ where: { userId: lone.id } }).catch(() => undefined);
        await prisma.user.delete({ where: { id: lone.id } });
      }
    });

    it("the stranger's 404 bodies are identical for a real and a missing order (no existence leak)", async () => {
      const o = await mixedOrder(dealer);
      const real = await replace(o.id, o.mug, replaceBody("x.png"), stranger);
      const missing = await replace("00000000-0000-0000-0000-000000000000", o.mug, replaceBody("x.png"), stranger);
      expect(real).toEqual(missing);
      // Also for a started line / a shop order / a trashed order: never 409 for someone else's order.
      await setLines(o.id, [o.banner], "PRINTING");
      expect(await replace(o.id, o.banner, replaceBody("x.png"), stranger)).toEqual(missing);
      await prisma.order.update({ where: { id: o.id }, data: { source: "shop" } });
      expect(await replace(o.id, o.mug, replaceBody("x.png"), stranger)).toEqual(missing);
    });
  });

  describe("audit: staff «Нужен макет» on a line the owner replaced", () => {
    it("flag hides the marker; the owner's layout fix clears it (the file is no longer the step-4 one)", async () => {
      const o = await mixedOrder(dealer);
      expect((await replace(o.id, o.mug, replaceBody("mug-v2.png"), dealer)).status).toBe(200);
      await flag(o.id, o.mug);
      const flagged = await line(o.mug);
      expect(flagged.productionStatus).toBe("NEEDS_LAYOUT");
      expect(flagged.ownerReplacedAt).not.toBeNull(); // the flagged file is still the owner's
      expect(isOwnerReplaceMarkerVisible(flagged)).toBe(false);
      expect((await cabinetDetail(o.id, dealer)).body.orderLines).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: o.mug, canReplaceFile: false, productionStatus: "NEEDS_LAYOUT" })]),
      );
      const fix = await replace(o.id, o.mug, replaceBody("mug-v3.png"), dealer);
      expect(fix).toMatchObject({ status: 200, body: { kind: "layout_fix" } });
      const fixed = await line(o.mug);
      expect(fixed).toMatchObject({ productionStatus: "WAITING", ownerReplacedAt: null, ownerReplacedById: null, ownerReplacedRole: null });
      expect(fixed.layoutFixedAt).not.toBeNull();
      expect(isOwnerReplaceMarkerVisible(fixed)).toBe(false);
      await expectInvariant(o.id);
    });

    it("flag then staff replace → the marker is cleared (not «заменён дилером» on the staff's file)", async () => {
      const o = await mixedOrder(dealer);
      expect((await replace(o.id, o.mug, replaceBody("mug-v2.png"), dealer)).status).toBe(200);
      await flag(o.id, o.mug);
      cookieJar.admin = staff.admin.token;
      const r = await read(await staffReplaceRoute(req(`/x`, "POST", { files: [{ fileName: "s.png", fileUrl: uploadKey("s.png") }] }), lineCtx(o.id, o.mug)));
      cookieJar.admin = null;
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(await line(o.mug)).toMatchObject({ productionStatus: "WAITING", ownerReplacedAt: null, ownerReplacedRole: null });
    });

    it("flag then «Снять отметку» → the file is still the owner's, so the marker stays and shows again", async () => {
      const o = await mixedOrder(dealer);
      const r = await replace(o.id, o.mug, replaceBody("mug-v2.png"), dealer);
      expect(r.status).toBe(200);
      await flag(o.id, o.mug);
      cookieJar.admin = staff.workshop.token;
      const c = await read(await clearFlagRoute(req(`/x`, "DELETE"), lineCtx(o.id, o.mug)));
      cookieJar.admin = null;
      expect(c.status, JSON.stringify(c.body)).toBe(200);
      const l = await line(o.mug);
      expect(l.productionStatus).toBe("WAITING");
      expect(l.ownerReplacedAt?.toISOString()).toBe(r.body.replacedAt);
      expect(isOwnerReplaceMarkerVisible(l)).toBe(true);
    });

    it("after the layout fix, a new owner replace sets the marker again", async () => {
      const o = await mixedOrder(retail);
      await flag(o.id, o.mug);
      expect((await replace(o.id, o.mug, replaceBody("fix.png"), retail)).body.kind).toBe("layout_fix");
      const r = await replace(o.id, o.mug, replaceBody("again.png"), retail);
      expect(r).toMatchObject({ status: 200, body: { kind: "replace" } });
      expect(await line(o.mug)).toMatchObject({ ownerReplacedRole: "client", productionStatus: "WAITING" });
    });
  });

  it("all orders this suite touched pass the invariant check", async () => {
    const res = await checkLineStatusSync(prisma, { orderIds: createdIds });
    expect(res.mismatches).toEqual([]);
  });
});
