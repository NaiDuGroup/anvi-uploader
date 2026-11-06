/**
 * Per-file replace: every replace (cabinet «Нужен макет» fix, cabinet replace
 * of a waiting line, staff replace) swaps ONE file of the line, named by
 * `fileId`. The prod bug this guards against: on lines with several files the
 * old whole-set swap dropped files and/or moved copies between files.
 *
 * Order: mug (.1/3, THREE files: copies 2 / 3 / 5 with different colour /
 * pages / paper) + notebook (.2/3, one file) + banner 50×70 (.3/3, THREE
 * files). Price 321.50 (non-null, so «price unchanged» is not vacuous).
 *
 * Route handlers run in-process with real sessions against a LOCAL database
 * (refuses any other DATABASE_URL). Run with
 * `npx vitest run --config vitest.integration.config.ts tests/integration/line-file-replace-per-file.test.ts`.
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
import { POST as flagRoute } from "@/app/api/orders/[id]/lines/[lineId]/layout-issue/route";
import { POST as staffReplaceRoute } from "@/app/api/orders/[id]/lines/[lineId]/replace-file/route";
import { POST as ownerReplaceRoute } from "@/app/api/cabinet/orders/[id]/lines/[lineId]/replace-file/route";
import { GET as getCabinetOrder } from "@/app/api/cabinet/orders/[id]/route";
import { ownerReplaceLayoutFile, ownerReplaceLineFile, staffReplaceLayoutFile } from "@/lib/orderLineLayoutIssue";
import { deriveWorkshopOrderStatus } from "@/lib/orderStatusFromLines";
import { checkLineStatusSync } from "@/lib/orderLineStatusCheck";
import { describeEntry, type HistoryEntry } from "@/app/admin/_components/HistoryPanel";
import { ru } from "@/lib/i18n/ru";
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

function req(body?: unknown): NextRequest {
  return new NextRequest("http://localhost/x", {
    method: "POST",
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
  return `uploads/${Date.now()}-${String(keySeq).padStart(8, "0")}-pf-${name}`;
}
const newFile = (name: string) => ({ fileName: name, fileUrl: uploadKey(name) });

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

/** Every column of a file row that a replace of ANOTHER file must leave byte-identical. */
const FILE_COLUMNS = {
  id: true,
  orderId: true,
  orderLineId: true,
  fileUrl: true,
  fileName: true,
  copies: true,
  color: true,
  paperType: true,
  pageCount: true,
  sizeBytes: true,
  pixelWidth: true,
  pixelHeight: true,
  dpi: true,
  widthMm: true,
  heightMm: true,
  metaStatus: true,
  metaReadAt: true,
} as const;

describe.skipIf(!isLocalDb)("integration: per-file replace on multi-file lines", () => {
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
      data: { kind: "INDIVIDUAL", phone: `+3736${stamp}${n + 2}`, personName: `IT per-file ${stamp}-${n}`, isDealer },
    });
    const user = await prisma.user.create({
      data: { name: `it-perfile-c${n}-${stamp}@anvi.test`, role: "customer", password: hashPassword("x"), studioCustomerId: customer.id },
    });
    return { customerId: customer.id, userId: user.id, token: await createSession(user.id) };
  }

  beforeAll(async () => {
    process.env.R2_ACCOUNT_ID = "local-dev";
    mugId = (await createTestMug(200, { sellPrice: 100, skuPrefix: "IT-PF" })).id;
    notebookId = (await createTestNotebook(200, "IT-PF-NB")).id;
    lf = await createTestLfMaterial(`IT PF BANNER ${stamp}`, { stockLm: 100 });
    dealer = await makeCustomer(true, 1);
    retail = await makeCustomer(false, 2);
    stranger = await makeCustomer(true, 3);
    for (const role of ["admin", "workshop"] as const) {
      const u = await prisma.user.create({ data: { name: `it-pf-${role}-${stamp}@anvi.test`, role, password: hashPassword("x") } });
      staff[role] = { id: u.id, token: await createSession(u.id) };
    }
  });

  afterAll(async () => {
    process.env.R2_ACCOUNT_ID = prevR2;
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

  interface Fx {
    id: string;
    orderNumber: number;
    mug: string;
    notebook: string;
    banner: string;
    /** Mug files by name: mug-a (copies 2), mug-b (3, bw, 4 pages, matte), mug-c (5, glossy). */
    mf: Record<"a" | "b" | "c", string>;
    /** Banner files: ban-a (1), ban-b (2), ban-c (4). */
    bf: Record<"a" | "b" | "c", string>;
    nbFile: string;
  }

  /** mug ×3 files + notebook ×1 + banner ×3, SENT_TO_WORKSHOP, price 321.50, owned by `owner`. */
  async function fixture(owner: Party | null): Promise<Fx> {
    cookieJar.admin = staff.admin.token;
    const n = createdIds.length;
    const res = await createAdminOrder(
      new NextRequest("http://localhost/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          lines: [
            { productType: "mug", mugProductId: mugId, mugLayoutData: layout, files: [{ fileName: "mug-a.png", fileUrl: `uploads/it-pf/mug-a-${n}.png`, copies: 2, color: "color" }] },
            { productType: "notebook", notebookProductId: notebookId, notebookLayoutData: layout, files: [{ fileName: "nb.png", fileUrl: `uploads/it-pf/nb-${n}.png`, copies: 1, color: "color" }] },
            {
              productType: "large_format_print",
              largeFormatMaterialId: lf.id,
              printWidthCm: 50,
              printHeightCm: 70,
              quantity: 1,
              customerType: "retail",
              files: [{ fileName: "ban-a.png", fileUrl: `uploads/it-pf/ban-a-${n}.png`, copies: 1, color: "color" }],
            },
          ],
        }),
      }),
    );
    const body = (await res.json()) as { id: string; orderNumber: number; status: string };
    expect(res.status, JSON.stringify(body)).toBe(201);
    expect(body.status).toBe("SENT_TO_WORKSHOP");
    cookieJar.admin = null;
    createdIds.push(body.id);
    await prisma.order.update({ where: { id: body.id }, data: { price: "321.50", ...(owner ? { clientId: owner.customerId } : {}) } });
    const ls = await prisma.orderLine.findMany({ where: { orderId: body.id }, orderBy: { sortOrder: "asc" } });
    const [mug, notebook, banner] = ls.map((l) => l.id) as [string, string, string];
    await prisma.file.createMany({
      data: [
        { orderId: body.id, orderLineId: mug, fileName: "mug-b.png", fileUrl: uploadKey("mug-b.png"), copies: 3, color: "bw", pageCount: 4, paperType: "matte", sizeBytes: 1234, pixelWidth: 800, pixelHeight: 600, dpi: 300, metaStatus: "ok", metaReadAt: new Date("2026-11-01T10:00:00Z") },
        { orderId: body.id, orderLineId: mug, fileName: "mug-c.png", fileUrl: uploadKey("mug-c.png"), copies: 5, color: "color", paperType: "glossy", widthMm: 210, heightMm: 297, metaStatus: "ok" },
        { orderId: body.id, orderLineId: banner, fileName: "ban-b.png", fileUrl: uploadKey("ban-b.png"), copies: 2, color: "color" },
        { orderId: body.id, orderLineId: banner, fileName: "ban-c.png", fileUrl: uploadKey("ban-c.png"), copies: 4, color: "bw" },
      ],
    });
    const files = await prisma.file.findMany({ where: { orderId: body.id } });
    const byName = (name: string) => files.find((f) => f.fileName === name)!.id;
    expect(String((await prisma.order.findUniqueOrThrow({ where: { id: body.id } })).price)).toBe("321.5");
    return {
      id: body.id,
      orderNumber: body.orderNumber,
      mug,
      notebook,
      banner,
      mf: { a: byName("mug-a.png"), b: byName("mug-b.png"), c: byName("mug-c.png") },
      bf: { a: byName("ban-a.png"), b: byName("ban-b.png"), c: byName("ban-c.png") },
      nbFile: byName("nb.png"),
    };
  }

  const code = (o: { orderNumber: number }, i: number) => `#${String(o.orderNumber).padStart(4, "0")}.${i}/3`;

  async function filesOf(lineId: string) {
    return prisma.file.findMany({ where: { orderLineId: lineId }, select: FILE_COLUMNS, orderBy: { fileName: "asc" } });
  }
  async function line(lineId: string) {
    return prisma.orderLine.findUniqueOrThrow({ where: { id: lineId } });
  }
  async function orderRow(orderId: string) {
    return prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  }
  async function logs(orderId: string, action?: string) {
    return prisma.orderLog.findMany({ where: { orderId, ...(action ? { action } : {}) }, orderBy: { createdAt: "asc" } });
  }
  async function archive(orderId: string) {
    return prisma.orderFileArchive.findMany({ where: { orderId }, orderBy: { archivedAt: "asc" } });
  }
  const qty = async (lineId: string) => (await filesOf(lineId)).reduce((s, f) => s + f.copies, 0);

  /** Everything a replace must not touch: money, stock, statuses, line JSON, every file row. */
  async function snapshot(orderId: string) {
    const o = await orderRow(orderId);
    const ls = await prisma.orderLine.findMany({ where: { orderId }, orderBy: { sortOrder: "asc" } });
    const moves = await prisma.stockMovement.findMany({
      where: { orderId },
      select: { id: true, variantId: true, delta: true },
      orderBy: { createdAt: "asc" },
    });
    return {
      price: String(o.price),
      status: o.status,
      isPaid: o.isPaid,
      dealerEditedAt: o.dealerEditedAt?.toISOString() ?? null,
      lines: ls.map((l) => ({
        id: l.id,
        productionStatus: l.productionStatus,
        layoutIssueReason: l.layoutIssueReason,
        layoutFixedAt: l.layoutFixedAt?.toISOString() ?? null,
        ownerReplacedAt: l.ownerReplacedAt?.toISOString() ?? null,
        quantity: (l as unknown as { quantity?: unknown }).quantity ?? null,
        largeFormatLineData: l.largeFormatLineData,
        mugLayoutData: l.mugLayoutData,
      })),
      files: await prisma.file.findMany({ where: { orderId }, select: FILE_COLUMNS, orderBy: { id: "asc" } }),
      moves,
      archive: await prisma.orderFileArchive.count({ where: { orderId } }),
      logs: await prisma.orderLog.count({ where: { orderId } }),
    };
  }

  async function ownerReplace(orderId: string, lineId: string, body: unknown, as: Party | null): Promise<Res> {
    cookieJar.customer = as?.token ?? null;
    const r = await read(await ownerReplaceRoute(req(body), lineCtx(orderId, lineId)));
    cookieJar.customer = null;
    return r;
  }
  async function staffReplace(orderId: string, lineId: string, body: unknown, as: "admin" | "workshop" = "workshop"): Promise<Res> {
    cookieJar.admin = staff[as].token;
    const r = await read(await staffReplaceRoute(req(body), lineCtx(orderId, lineId)));
    cookieJar.admin = null;
    return r;
  }
  async function setLines(orderId: string, lineIds: string[], status: string) {
    cookieJar.admin = staff.workshop.token;
    const r = await read(
      await patchLineStatus(
        new NextRequest("http://localhost/x", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lineIds, status }),
        }),
        ctx(orderId),
      ),
    );
    cookieJar.admin = null;
    expect(r.status, JSON.stringify(r.body)).toBe(200);
  }
  async function flag(orderId: string, lineId: string) {
    cookieJar.admin = staff.workshop.token;
    const r = await read(await flagRoute(req({ reason: "lowQuality", note: "72 dpi" }), lineCtx(orderId, lineId)));
    cookieJar.admin = null;
    expect(r.status, JSON.stringify(r.body)).toBe(200);
  }
  async function expectInvariant(orderId: string) {
    const o = await orderRow(orderId);
    const ls = await prisma.orderLine.findMany({ where: { orderId } });
    if (["SENT_TO_WORKSHOP", "WORKSHOP_PRINTING", "WORKSHOP_READY"].includes(o.status)) {
      expect(deriveWorkshopOrderStatus(ls)).toBe(o.status);
    }
    expect((await checkLineStatusSync(prisma, { orderIds: [orderId] })).mismatches).toEqual([]);
  }
  function history(entry: { action: string; field: string | null; oldValue: string | null; newValue: string | null; metadata: unknown }): string {
    const e: HistoryEntry = {
      id: "x",
      action: entry.action,
      field: entry.field,
      oldValue: entry.oldValue,
      newValue: entry.newValue,
      metadata: entry.metadata as Record<string, unknown>,
      createdAt: new Date().toISOString(),
      userName: "u",
      userRole: "customer",
    };
    return describeEntry(e, ru);
  }

  /** The two files that were NOT replaced, byte-identical to before (every column incl. id and meta). */
  async function expectOthersIdentical(lineId: string, before: Awaited<ReturnType<typeof filesOf>>, replacedId: string) {
    const after = await filesOf(lineId);
    const keep = before.filter((f) => f.id !== replacedId);
    expect(after.filter((f) => f.id !== replacedId && keep.some((k) => k.id === f.id))).toEqual(keep);
    expect(after.some((f) => f.id === replacedId)).toBe(false);
    expect(after).toHaveLength(before.length);
  }

  // ─── Owner, WAITING line (kind: "replace") ───────────────────────────────

  describe("owner replaces one file of a waiting multi-file line", () => {
    it("3-file line, middle file: the other 2 byte-identical, copies / colour / pages / paper kept, 1 archive row, price unchanged", async () => {
      const o = await fixture(dealer);
      const before = await filesOf(o.mug);
      const snap = await snapshot(o.id);
      const r = await ownerReplace(o.id, o.mug, { kind: "replace", fileId: o.mf.b, files: [newFile("mug-b-v2.png")] }, dealer);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body).toMatchObject({
        kind: "replace",
        lineStatus: "WAITING",
        replaced: { oldFileId: o.mf.b, oldFileName: "mug-b.png", newFileName: "mug-b-v2.png" },
      });

      await expectOthersIdentical(o.mug, before, o.mf.b);
      const after = await filesOf(o.mug);
      const nw = after.find((f) => f.fileName === "mug-b-v2.png")!;
      expect(nw).toMatchObject({ copies: 3, color: "bw", pageCount: 4, paperType: "matte", orderId: o.id, orderLineId: o.mug });
      expect(nw.id).toBe((r.body.replaced as { newFileId: string }).newFileId);
      // The old file's size line described the old artwork: the new row starts without it.
      expect(nw).toMatchObject({ sizeBytes: null, pixelWidth: null, dpi: null, metaStatus: null, metaReadAt: null });
      expect(await qty(o.mug)).toBe(10);

      const arch = await archive(o.id);
      expect(arch).toHaveLength(1);
      const oldB = before.find((f) => f.id === o.mf.b)!;
      expect(arch[0]).toMatchObject({
        orderLineId: o.mug,
        lineProductType: "mug",
        fileName: "mug-b.png",
        fileUrl: oldB.fileUrl,
        copies: 3,
        color: "bw",
        pageCount: 4,
        paperType: "matte",
        reason: "owner_replace",
        archivedById: dealer.userId,
      });

      const now = await snapshot(o.id);
      expect(now.price).toBe("321.5");
      expect(now.price).toBe(snap.price);
      expect(now.moves).toEqual(snap.moves);
      expect(now.status).toBe(snap.status);
      expect(now.lines.map((l) => [l.id, l.productionStatus, l.quantity, l.largeFormatLineData, l.mugLayoutData])).toEqual(
        snap.lines.map((l) => [l.id, l.productionStatus, l.quantity, l.largeFormatLineData, l.mugLayoutData]),
      );
      // Notebook and banner files untouched.
      expect(now.files.filter((f) => f.orderLineId !== o.mug)).toEqual(snap.files.filter((f) => f.orderLineId !== o.mug));
      expect((await line(o.mug)).ownerReplacedRole).toBe("dealer");
      expect((await orderRow(o.id)).dealerEditedAt).not.toBeNull();
      await expectInvariant(o.id);
    });

    it("the first and then the last file: each replace touches only its file; 2 archive rows; quantity stays 10", async () => {
      const o = await fixture(dealer);
      expect((await ownerReplace(o.id, o.mug, { kind: "replace", fileId: o.mf.a, files: [newFile("a2.png")] }, dealer)).status).toBe(200);
      const mid = await filesOf(o.mug);
      expect((await ownerReplace(o.id, o.mug, { kind: "replace", fileId: o.mf.c, files: [newFile("c2.png")] }, dealer)).status).toBe(200);
      await expectOthersIdentical(o.mug, mid, o.mf.c);
      const fs = await filesOf(o.mug);
      expect(fs.map((f) => [f.fileName, f.copies, f.color, f.paperType])).toEqual([
        ["a2.png", 2, "color", null],
        ["c2.png", 5, "color", "glossy"],
        ["mug-b.png", 3, "bw", "matte"],
      ]);
      expect((await archive(o.id)).map((a) => [a.fileName, a.copies])).toEqual([
        ["mug-a.png", 2],
        ["mug-c.png", 5],
      ]);
      expect(String((await orderRow(o.id)).price)).toBe("321.5");
    });

    it("missing fileId: a 1-file line works (backward compatible), a 3-file line → 400 file_id_required, nothing changed", async () => {
      const o = await fixture(dealer);
      const ok = await ownerReplace(o.id, o.notebook, { kind: "replace", files: [newFile("nb2.png")] }, dealer);
      expect(ok.status, JSON.stringify(ok.body)).toBe(200);
      expect((await filesOf(o.notebook)).map((f) => [f.fileName, f.copies])).toEqual([["nb2.png", 1]]);

      const snap = await snapshot(o.id);
      const r = await ownerReplace(o.id, o.mug, { kind: "replace", files: [newFile("x.png")] }, dealer);
      expect(r).toMatchObject({ status: 400, body: { error: "file_id_required", detail: "3" } });
      expect(await snapshot(o.id)).toEqual(snap);
    });

    it("fileId of ANOTHER line of the same order → 404 file_not_in_line, nothing changed", async () => {
      const o = await fixture(dealer);
      const snap = await snapshot(o.id);
      const r = await ownerReplace(o.id, o.mug, { kind: "replace", fileId: o.nbFile, files: [newFile("x.png")] }, dealer);
      expect(r).toMatchObject({ status: 404, body: { error: "file_not_in_line" } });
      expect(await snapshot(o.id)).toEqual(snap);
      // …also the other way round (a mug file on the notebook line).
      const r2 = await ownerReplace(o.id, o.notebook, { kind: "replace", fileId: o.mf.a, files: [newFile("x.png")] }, dealer);
      expect(r2.status).toBe(404);
      expect(await snapshot(o.id)).toEqual(snap);
    });

    it("fileId of ANOTHER order (same owner) → 404, neither order changes", async () => {
      const o = await fixture(dealer);
      const other = await fixture(dealer);
      const snapA = await snapshot(o.id);
      const snapB = await snapshot(other.id);
      const r = await ownerReplace(o.id, o.mug, { kind: "replace", fileId: other.mf.b, files: [newFile("x.png")] }, dealer);
      expect(r).toMatchObject({ status: 404, body: { error: "file_not_in_line" } });
      expect(await snapshot(o.id)).toEqual(snapA);
      expect(await snapshot(other.id)).toEqual(snapB);
    });

    it("an unknown fileId → 404; an empty fileId → 400; nothing changed", async () => {
      const o = await fixture(dealer);
      const snap = await snapshot(o.id);
      expect(
        (await ownerReplace(o.id, o.mug, { kind: "replace", fileId: "00000000-0000-4000-8000-000000000000", files: [newFile("x.png")] }, dealer)).status,
      ).toBe(404);
      expect((await ownerReplace(o.id, o.mug, { kind: "replace", fileId: "", files: [newFile("x.png")] }, dealer)).status).toBe(400);
      expect((await ownerReplace(o.id, o.mug, { kind: "replace", fileId: 42, files: [newFile("x.png")] }, dealer)).status).toBe(400);
      expect(await snapshot(o.id)).toEqual(snap);
    });

    it("another client with a real fileId → 404 Not found (no leak), nothing changed", async () => {
      const o = await fixture(dealer);
      const snap = await snapshot(o.id);
      const r = await ownerReplace(o.id, o.mug, { kind: "replace", fileId: o.mf.b, files: [newFile("x.png")] }, stranger);
      expect(r).toMatchObject({ status: 404, body: { error: "Not found" } });
      expect(await snapshot(o.id)).toEqual(snap);
    });

    it("the dealer cannot replace any file of a line that started (PRINTING / DONE) → 409 line_started, files kept", async () => {
      const o = await fixture(dealer);
      await setLines(o.id, [o.mug], "PRINTING");
      const snap = await snapshot(o.id);
      for (const fileId of [o.mf.a, o.mf.b, o.mf.c]) {
        const r = await ownerReplace(o.id, o.mug, { kind: "replace", fileId, files: [newFile("late.png")] }, dealer);
        expect(r, fileId).toMatchObject({ status: 409, body: { error: "line_started", detail: "PRINTING" } });
      }
      // Missing fileId on a started line: still line_started (the line check comes first).
      expect((await ownerReplace(o.id, o.mug, { kind: "replace", files: [newFile("late.png")] }, dealer)).body.error).toBe("line_started");
      expect(await snapshot(o.id)).toEqual(snap);
      await setLines(o.id, [o.mug], "DONE");
      const r = await ownerReplace(o.id, o.mug, { kind: "replace", fileId: o.mf.b, files: [newFile("late.png")] }, dealer);
      expect(r).toMatchObject({ status: 409, body: { error: "line_started", detail: "DONE" } });
      // Another (waiting) line of the same order still can.
      expect((await ownerReplace(o.id, o.banner, { kind: "replace", fileId: o.bf.c, files: [newFile("bc2.png")] }, dealer)).status).toBe(200);
    });

    it("the workshop starts the line just before the lock → 409, the file is not replaced", async () => {
      const o = await fixture(dealer);
      const before = await filesOf(o.mug);
      const err = await ownerReplaceLineFile(prisma, {
        orderId: o.id,
        lineId: o.mug,
        actor: { userId: dealer.userId, studioCustomerId: dealer.customerId },
        fileId: o.mf.b,
        files: [newFile("late.png")],
        hooks: { beforeLock: async () => void (await prisma.orderLine.update({ where: { id: o.mug }, data: { productionStatus: "PRINTING" } })) },
      }).catch((e: unknown) => e);
      expect(err).toMatchObject({ code: "line_started" });
      expect(await filesOf(o.mug)).toEqual(before);
      expect(await archive(o.id)).toHaveLength(0);
    });

    it("the log names the file: line_file_replaced old → new name, history «файл mug-b.png заменён на …»", async () => {
      const o = await fixture(dealer);
      expect((await ownerReplace(o.id, o.mug, { kind: "replace", fileId: o.mf.b, files: [newFile("IMG_1.jpg")] }, dealer)).status).toBe(200);
      const [log] = await logs(o.id, "line_file_replaced");
      expect(log).toMatchObject({ oldValue: "mug-b.png", newValue: "IMG_1.jpg", field: "files" });
      expect(log!.metadata).toMatchObject({
        orderLineId: o.mug,
        lineCode: code(o, 1),
        by: "owner",
        role: "dealer",
        replacedFileId: o.mf.b,
        replacedFileName: "mug-b.png",
        newFileName: "IMG_1.jpg",
        archivedFiles: [{ fileName: "mug-b.png" }],
        files: [{ fileName: "IMG_1.jpg" }],
      });
      expect(history(log!)).toBe(`Позиция ${code(o, 1)}: файл mug-b.png заменён на IMG_1.jpg дилером до начала печати`);
    });

    it("a retail client: same per-file replace, no «Изменён дилером», history says «клиентом»", async () => {
      const o = await fixture(retail);
      const before = await filesOf(o.banner);
      expect((await ownerReplace(o.id, o.banner, { kind: "replace", fileId: o.bf.b, files: [newFile("bb.png")] }, retail)).status).toBe(200);
      await expectOthersIdentical(o.banner, before, o.bf.b);
      expect((await orderRow(o.id)).dealerEditedAt).toBeNull();
      const [log] = await logs(o.id, "line_file_replaced");
      expect(history(log!)).toContain("заменён на bb.png клиентом");
    });

    it("a replaced file's old id no longer works (the new file has a new id) → 404, nothing more changed", async () => {
      const o = await fixture(dealer);
      expect((await ownerReplace(o.id, o.mug, { kind: "replace", fileId: o.mf.b, files: [newFile("v2.png")] }, dealer)).status).toBe(200);
      const snap = await snapshot(o.id);
      const r = await ownerReplace(o.id, o.mug, { kind: "replace", fileId: o.mf.b, files: [newFile("v3.png")] }, dealer);
      expect(r).toMatchObject({ status: 404, body: { error: "file_not_in_line" } });
      expect(await snapshot(o.id)).toEqual(snap);
    });

    it("concurrent double replace of the SAME file: one 200, one 404; one archive row; 3 files, quantity 10", async () => {
      const o = await fixture(dealer);
      const [r1, r2] = await Promise.all([
        ownerReplaceLineFile(prisma, {
          orderId: o.id,
          lineId: o.mug,
          actor: { userId: dealer.userId, studioCustomerId: dealer.customerId },
          fileId: o.mf.b,
          files: [newFile("race-1.png")],
        }).then((v) => ({ ok: true as const, v }), (e: unknown) => ({ ok: false as const, e })),
        ownerReplaceLineFile(prisma, {
          orderId: o.id,
          lineId: o.mug,
          actor: { userId: dealer.userId, studioCustomerId: dealer.customerId },
          fileId: o.mf.b,
          files: [newFile("race-2.png")],
        }).then((v) => ({ ok: true as const, v }), (e: unknown) => ({ ok: false as const, e })),
      ]);
      expect([r1.ok, r2.ok].sort()).toEqual([false, true]);
      const failed = (r1.ok ? r2 : r1) as { e: unknown };
      expect(failed.e).toMatchObject({ code: "file_not_in_line", httpStatus: 404 });
      const fs = await filesOf(o.mug);
      expect(fs).toHaveLength(3);
      expect(fs.filter((f) => f.fileName.startsWith("race-"))).toHaveLength(1);
      expect(await qty(o.mug)).toBe(10);
      expect(await archive(o.id)).toHaveLength(1);
      expect(await logs(o.id, "line_file_replaced")).toHaveLength(1);
    });

    it("concurrent replace of two DIFFERENT files of one line: both apply, nothing lost", async () => {
      const o = await fixture(dealer);
      const rs = await Promise.all([
        ownerReplace(o.id, o.mug, { kind: "replace", fileId: o.mf.a, files: [newFile("p-a.png")] }, dealer),
        ownerReplaceLineFile(prisma, {
          orderId: o.id,
          lineId: o.mug,
          actor: { userId: dealer.userId, studioCustomerId: dealer.customerId },
          fileId: o.mf.c,
          files: [newFile("p-c.png")],
        }),
      ]);
      expect(rs[0].status).toBe(200);
      const fs = await filesOf(o.mug);
      expect(fs.map((f) => [f.fileName, f.copies])).toEqual([
        ["mug-b.png", 3],
        ["p-a.png", 2],
        ["p-c.png", 5],
      ]);
      expect(await archive(o.id)).toHaveLength(2);
    });

    it("cabinet detail: a waiting 3-file line offers the replace (per file in the UI)", async () => {
      const o = await fixture(dealer);
      cookieJar.customer = dealer.token;
      const d = await read(await getCabinetOrder(new NextRequest("http://localhost/x"), ctx(o.id)));
      cookieJar.customer = null;
      const ls = d.body.orderLines as Array<Record<string, unknown>>;
      expect(ls.map((l) => [l.id, l.canReplaceFile])).toEqual([
        [o.mug, true],
        [o.notebook, true],
        [o.banner, true],
      ]);
    });
  });

  // ─── Owner, NEEDS_LAYOUT line (the step-3 fix) ───────────────────────────

  describe("owner fixes a «Нужен макет» multi-file line by replacing one file", () => {
    it("3-file flagged line: one replaced file → WAITING, layoutFixedAt, flag cleared, order derived; the other 2 untouched", async () => {
      const o = await fixture(dealer);
      await flag(o.id, o.mug);
      const before = await filesOf(o.mug);
      const r = await ownerReplace(o.id, o.mug, { fileId: o.mf.c, files: [newFile("mug-c-fixed.png")] }, dealer);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body).toMatchObject({ lineStatus: "WAITING", replaced: { oldFileId: o.mf.c, newFileName: "mug-c-fixed.png" } });
      await expectOthersIdentical(o.mug, before, o.mf.c);
      expect((await filesOf(o.mug)).find((f) => f.fileName === "mug-c-fixed.png")).toMatchObject({ copies: 5, paperType: "glossy" });
      const l = await line(o.mug);
      expect(l).toMatchObject({ productionStatus: "WAITING", layoutIssueReason: null, layoutIssueNote: null, layoutFixedById: dealer.userId });
      expect(l.layoutFixedAt).not.toBeNull();
      const o2 = await orderRow(o.id);
      expect(o2.status).toBe("SENT_TO_WORKSHOP");
      expect(String(o2.price)).toBe("321.5");
      const arch = await archive(o.id);
      expect(arch.map((a) => [a.fileName, a.reason, a.copies])).toEqual([["mug-c.png", "layout_issue", 5]]);
      await expectInvariant(o.id);
    });

    it("while another line prints: the order stays WORKSHOP_PRINTING and matches the derived status", async () => {
      const o = await fixture(dealer);
      await setLines(o.id, [o.banner], "PRINTING");
      await flag(o.id, o.mug);
      expect((await orderRow(o.id)).status).toBe("WORKSHOP_PRINTING");
      const r = await ownerReplace(o.id, o.mug, { fileId: o.mf.a, files: [newFile("fix.png")] }, dealer);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect((await line(o.mug)).productionStatus).toBe("WAITING");
      expect((await orderRow(o.id)).status).toBe("WORKSHOP_PRINTING");
      await expectInvariant(o.id);
    });

    it("flagged 3-file line without fileId → 400 file_id_required, still flagged, files kept", async () => {
      const o = await fixture(dealer);
      await flag(o.id, o.mug);
      const snap = await snapshot(o.id);
      const r = await ownerReplace(o.id, o.mug, { files: [newFile("x.png")] }, dealer);
      expect(r).toMatchObject({ status: 400, body: { error: "file_id_required" } });
      expect(await snapshot(o.id)).toEqual(snap);
      expect((await line(o.mug)).productionStatus).toBe("NEEDS_LAYOUT");
    });

    it("flagged line, fileId of another line → 404, still flagged, nothing changed", async () => {
      const o = await fixture(dealer);
      await flag(o.id, o.mug);
      const snap = await snapshot(o.id);
      const r = await ownerReplace(o.id, o.mug, { fileId: o.bf.a, files: [newFile("x.png")] }, dealer);
      expect(r).toMatchObject({ status: 404, body: { error: "file_not_in_line" } });
      expect(await snapshot(o.id)).toEqual(snap);
    });

    it("flagged line through kind:\"replace\" with a fileId → the layout fix of that one file", async () => {
      const o = await fixture(dealer);
      await flag(o.id, o.banner);
      const before = await filesOf(o.banner);
      const r = await ownerReplace(o.id, o.banner, { kind: "replace", fileId: o.bf.b, files: [newFile("bb.png")] }, dealer);
      expect(r).toMatchObject({ status: 200, body: { kind: "layout_fix", lineStatus: "WAITING" } });
      await expectOthersIdentical(o.banner, before, o.bf.b);
      expect((await archive(o.id))[0]).toMatchObject({ fileName: "ban-b.png", reason: "layout_issue", copies: 2 });
    });

    it("the log names the file: line_layout_fixed + history «файл … заменён на … клиентом»", async () => {
      const o = await fixture(dealer);
      await flag(o.id, o.mug);
      await ownerReplaceLayoutFile(prisma, {
        orderId: o.id,
        lineId: o.mug,
        actor: { userId: dealer.userId, studioCustomerId: dealer.customerId },
        fileId: o.mf.a,
        files: [newFile("IMG_1.jpg")],
      });
      const [log] = await logs(o.id, "line_layout_fixed");
      expect(log).toMatchObject({ oldValue: "mug-a.png", newValue: "IMG_1.jpg" });
      expect(log!.metadata).toMatchObject({ by: "client", reason: "lowQuality", replacedFileId: o.mf.a, replacedFileName: "mug-a.png" });
      expect(history(log!)).toBe(
        `Позиция ${code(o, 1)}: файл mug-a.png заменён на IMG_1.jpg клиентом, позиция снова ждёт печати`,
      );
    });
  });

  // ─── Staff replace ───────────────────────────────────────────────────────

  describe("staff replaces one file of a flagged multi-file line", () => {
    it("upload, middle banner file: the other 2 byte-identical, copies kept, WAITING, 1 archive row, price unchanged", async () => {
      const o = await fixture(dealer);
      await flag(o.id, o.banner);
      const before = await filesOf(o.banner);
      const snap = await snapshot(o.id);
      const r = await staffReplace(o.id, o.banner, { fileId: o.bf.b, files: [newFile("ban-b-v2.pdf")] });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body).toMatchObject({ lineStatus: "WAITING", newOrderStatus: "SENT_TO_WORKSHOP", replaced: { oldFileId: o.bf.b } });
      await expectOthersIdentical(o.banner, before, o.bf.b);
      expect((await filesOf(o.banner)).find((f) => f.fileName === "ban-b-v2.pdf")).toMatchObject({ copies: 2, color: "color" });
      expect(await qty(o.banner)).toBe(7);
      expect(await archive(o.id)).toHaveLength(1);
      const now = await snapshot(o.id);
      expect(now.price).toBe(snap.price);
      expect(now.moves).toEqual(snap.moves);
      expect((await line(o.banner))).toMatchObject({ productionStatus: "WAITING", layoutFixedById: staff.workshop.id });
      const [log] = await logs(o.id, "line_layout_fixed");
      expect(history(log!)).toBe(`Позиция ${code(o, 3)}: файл ban-b.png заменён на ban-b-v2.pdf студией, позиция снова ждёт печати`);
      await expectInvariant(o.id);
    });

    it("link, last banner file: the link replaces only that file (copies 4 / bw kept), the others byte-identical", async () => {
      const o = await fixture(null);
      await flag(o.id, o.banner);
      const before = await filesOf(o.banner);
      const url = "https://drive.google.com/file/d/perfile123/view";
      const r = await staffReplace(o.id, o.banner, { fileId: o.bf.c, files: [{ fileName: url, fileUrl: url }] }, "admin");
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      await expectOthersIdentical(o.banner, before, o.bf.c);
      expect((await filesOf(o.banner)).find((f) => f.fileUrl === url)).toMatchObject({ fileName: url, copies: 4, color: "bw" });
      expect(await archive(o.id)).toHaveLength(1);
      expect(String((await orderRow(o.id)).price)).toBe("321.5");
    });

    it("missing fileId: a 3-file line → 400 file_id_required (still flagged); a 1-file line works", async () => {
      const o = await fixture(null);
      await flag(o.id, o.banner);
      await flag(o.id, o.notebook);
      const snap = await snapshot(o.id);
      expect(await staffReplace(o.id, o.banner, { files: [newFile("x.png")] })).toMatchObject({
        status: 400,
        body: { error: "file_id_required", detail: "3" },
      });
      expect(await snapshot(o.id)).toEqual(snap);
      const ok = await staffReplace(o.id, o.notebook, { files: [newFile("nb-fixed.png")] });
      expect(ok.status, JSON.stringify(ok.body)).toBe(200);
      expect((await filesOf(o.notebook)).map((f) => f.fileName)).toEqual(["nb-fixed.png"]);
    });

    it("fileId of another order / another line → 404 file_not_in_line, still flagged, nothing changed", async () => {
      const o = await fixture(null);
      const other = await fixture(null);
      await flag(o.id, o.banner);
      const snap = await snapshot(o.id);
      const snapOther = await snapshot(other.id);
      expect(await staffReplace(o.id, o.banner, { fileId: other.bf.b, files: [newFile("x.png")] })).toMatchObject({
        status: 404,
        body: { error: "file_not_in_line" },
      });
      expect(await staffReplace(o.id, o.banner, { fileId: o.mf.a, files: [newFile("x.png")] })).toMatchObject({ status: 404 });
      expect(await snapshot(o.id)).toEqual(snap);
      expect(await snapshot(other.id)).toEqual(snapOther);
    });

    it("a WAITING line (not flagged) → 409 line_not_flagged even with a valid fileId", async () => {
      const o = await fixture(null);
      const snap = await snapshot(o.id);
      expect(await staffReplace(o.id, o.banner, { fileId: o.bf.a, files: [newFile("x.png")] })).toMatchObject({
        status: 409,
        body: { error: "line_not_flagged" },
      });
      expect(await snapshot(o.id)).toEqual(snap);
    });

    it("concurrent staff + owner replace of a flagged line: exactly one wins, one archive row, 3 files", async () => {
      const o = await fixture(dealer);
      await flag(o.id, o.mug);
      const results = await Promise.allSettled([
        staffReplaceLayoutFile(prisma, { orderId: o.id, lineId: o.mug, userId: staff.workshop.id, fileId: o.mf.b, files: [newFile("staff.png")] }),
        ownerReplaceLayoutFile(prisma, {
          orderId: o.id,
          lineId: o.mug,
          actor: { userId: dealer.userId, studioCustomerId: dealer.customerId },
          fileId: o.mf.b,
          files: [newFile("owner.png")],
        }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
      // The loser sees the line already fixed (line_not_flagged).
      expect(rejected.reason).toMatchObject({ code: "line_not_flagged" });
      const fs = await filesOf(o.mug);
      expect(fs).toHaveLength(3);
      expect(fs.filter((f) => f.fileName === "staff.png" || f.fileName === "owner.png")).toHaveLength(1);
      expect(await archive(o.id)).toHaveLength(1);
      expect(await logs(o.id, "line_layout_fixed")).toHaveLength(1);
      await expectInvariant(o.id);
    });

    it("concurrent double staff replace of the same file: one 200, one 409; one archive row", async () => {
      const o = await fixture(null);
      await flag(o.id, o.banner);
      const [a, b] = await Promise.all([
        staffReplace(o.id, o.banner, { fileId: o.bf.a, files: [newFile("s1.png")] }),
        staffReplace(o.id, o.banner, { fileId: o.bf.a, files: [newFile("s2.png")] }, "admin"),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      expect(await filesOf(o.banner)).toHaveLength(3);
      expect(await archive(o.id)).toHaveLength(1);
    });
  });
});
