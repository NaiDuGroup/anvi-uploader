import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const db = vi.hoisted(() => ({
  corporateRequest: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
    update: vi.fn(),
  },
  user: { findUnique: vi.fn(), findMany: vi.fn() },
  studioCustomer: { findFirst: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const auth = vi.hoisted(() => ({ getSessionUser: vi.fn(async (): Promise<unknown> => null) }));
vi.mock("@/lib/auth", () => auth);

const limiter = vi.hoisted(() => ({
  hitRateLimit: vi.fn(async (): Promise<{ allowed: boolean; count: number; limit: number; retryAfterSec: number }> => ({
    allowed: true,
    count: 1,
    limit: 5,
    retryAfterSec: 60,
  })),
}));
vi.mock("@/lib/rateLimit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rateLimit")>()),
  hitRateLimit: limiter.hitRateLimit,
}));

const storage = vi.hoisted(() => ({
  copyObject: vi.fn(async () => true),
  getObjectMeta: vi.fn(async (): Promise<{ contentType: string | null; size: number } | null> => ({
    contentType: "application/postscript",
    size: 5000,
  })),
  isLocalObjectStorage: vi.fn(() => false),
  getPresignedDownloadUrl: vi.fn(async (k: string) => `https://r2.example/${k}?sig=1`),
}));
vi.mock("@/lib/r2", () => storage);

const mail = vi.hoisted(() => ({ sendCorporateReceivedEmail: vi.fn(async () => {}) }));
vi.mock("@/lib/email/corporateNotify", () => mail);
const alerts = vi.hoisted(() => ({ alertCorporateRequest: vi.fn(async () => {}) }));
vi.mock("@/lib/notify/staffAlerts", () => alerts);

import { POST as submit } from "@/app/api/shop/corporate-request/route";
import { GET as list } from "@/app/api/admin/corporate-requests/route";
import { GET as count } from "@/app/api/admin/corporate-requests/count/route";
import { GET as getOne, PATCH as patchOne } from "@/app/api/admin/corporate-requests/[id]/route";
import { GET as getFile } from "@/app/api/admin/corporate-requests/[id]/files/[index]/route";
import { chisinauToday } from "./requestRules";
import { isRecentCorporateRequestNumber } from "./requests";

function inDays(n: number): string {
  const d = new Date(`${chisinauToday()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const form = () => ({
  companyName: "Orange Moldova",
  contactName: "Maria",
  phone: "069 111 222",
  email: "maria@orange.md",
  products: ["notebooks", "other"],
  productsOther: "Umbrele",
  quantity: "250_500",
  deadline: inDays(10),
  hasLogo: true,
  files: [{ fileKey: "uploads/9-x-logo.ai", fileName: "logo.ai", sizeBytes: 5000 }],
  message: "",
  consent: true,
  lang: "ro",
  website: "",
});

function post(body: unknown, ip = "10.0.0.1") {
  return new NextRequest("http://anvi.md/api/shop/corporate-request", {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": ip, "user-agent": "vitest" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const STAFF = { id: "u1", name: "anvi", displayName: "Anvi", role: "superadmin" };
const ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  number: 12,
  status: "new",
  companyName: "Orange Moldova",
  contactName: "Maria",
  phone: "069 111 222",
  email: "maria@orange.md",
  products: ["notebooks"],
  productsOther: null,
  quantity: "250_500",
  deadline: new Date("2026-12-01T00:00:00Z"),
  budget: null,
  hasLogo: true,
  files: [{ key: "corporate-requests/9-x-logo.ai", name: "logo.ai", size: 5000 }],
  message: null,
  lang: "ro",
  notes: null,
  assigneeId: null,
  statusChangedAt: null,
  createdAt: new Date("2026-11-05T09:00:00Z"),
  updatedAt: new Date("2026-11-05T09:00:00Z"),
};
const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
const adminReq = (url: string, init?: RequestInit) =>
  new NextRequest(`http://print.anvi.md${url}`, init as ConstructorParameters<typeof NextRequest>[1]);

beforeEach(() => {
  vi.clearAllMocks();
  auth.getSessionUser.mockResolvedValue(null);
  limiter.hitRateLimit.mockResolvedValue({ allowed: true, count: 1, limit: 5, retryAfterSec: 60 });
  db.corporateRequest.create.mockResolvedValue({ id: ROW.id, number: 12 });
  storage.copyObject.mockResolvedValue(true);
  storage.getObjectMeta.mockResolvedValue({ contentType: "application/postscript", size: 5000 });
});

describe("POST /api/shop/corporate-request", () => {
  it("stores the request, keeps the file and fires the e-mail + staff alert once", async () => {
    const res = await submit(post(form()));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, number: 12 });
    expect(limiter.hitRateLimit).toHaveBeenCalledWith(expect.objectContaining({ name: "corporate-request" }), "10.0.0.1");
    expect(storage.copyObject).toHaveBeenCalledWith("uploads/9-x-logo.ai", "corporate-requests/9-x-logo.ai");
    const data = db.corporateRequest.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({
      companyName: "Orange Moldova",
      products: ["notebooks", "other"],
      productsOther: "Umbrele",
      quantity: "250_500",
      hasLogo: true,
      message: null,
      budget: null,
      lang: "ro",
      ip: "10.0.0.1",
      userAgent: "vitest",
      files: [{ key: "corporate-requests/9-x-logo.ai", name: "logo.ai", size: 5000 }],
    });
    expect(data.consentAt).toBeInstanceOf(Date);
    expect(data).not.toHaveProperty("website");
    expect(mail.sendCorporateReceivedEmail).toHaveBeenCalledTimes(1);
    expect(mail.sendCorporateReceivedEmail).toHaveBeenCalledWith(ROW.id);
    expect(alerts.alertCorporateRequest).toHaveBeenCalledTimes(1);
    expect(alerts.alertCorporateRequest).toHaveBeenCalledWith(ROW.id);
  });

  it("a missing upload is dropped, the request is still stored", async () => {
    storage.copyObject.mockResolvedValue(false);
    expect((await submit(post(form()))).status).toBe(201);
    expect(db.corporateRequest.create.mock.calls[0]![0].data.files).toEqual([]);
  });

  it("refuses an .exe attachment (by name or by stored key) with files: file_type", async () => {
    for (const f of [
      { fileKey: "uploads/9-x-qa-bad.exe", fileName: "qa-bad.exe", sizeBytes: 7 },
      { fileKey: "uploads/9-x-qa-bad.exe", fileName: "logo.png", sizeBytes: 7 },
    ]) {
      const res = await submit(post({ ...form(), files: [f] }));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_input", fields: { files: "file_type" } });
    }
    expect(db.corporateRequest.create).not.toHaveBeenCalled();
    expect(storage.copyObject).not.toHaveBeenCalled();
  });

  it("refuses an upload whose stored content type is not the declared kind", async () => {
    storage.getObjectMeta.mockResolvedValue({ contentType: "application/x-msdownload", size: 5000 });
    const res = await submit(post(form()));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_input", fields: { files: "file_type" } });
    expect(db.corporateRequest.create).not.toHaveBeenCalled();
  });

  it("refuses an upload larger than the limit (real stored size)", async () => {
    storage.getObjectMeta.mockResolvedValue({ contentType: "application/postscript", size: 101 * 1024 * 1024 });
    const res = await submit(post(form()));
    expect(await res.json()).toEqual({ error: "invalid_input", fields: { files: "file_too_large" } });
  });

  it("honeypot: answers like a success but stores and sends nothing", async () => {
    const res = await submit(post({ ...form(), website: "https://cheap-pills.example" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, number: null });
    expect(db.corporateRequest.create).not.toHaveBeenCalled();
    expect(mail.sendCorporateReceivedEmail).not.toHaveBeenCalled();
    expect(alerts.alertCorporateRequest).not.toHaveBeenCalled();
  });

  it("400 with the bad fields", async () => {
    const res = await submit(post({ ...form(), email: "x", consent: false, deadline: inDays(-1) }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; fields: Record<string, string> };
    expect(body.error).toBe("invalid_input");
    expect(Object.keys(body.fields).sort()).toEqual(["consent", "email"]);
    expect(db.corporateRequest.create).not.toHaveBeenCalled();

    const past = await submit(post({ ...form(), deadline: inDays(-1) }));
    expect(((await past.json()) as { fields: Record<string, string> }).fields).toEqual({ deadline: "invalid" });
    expect((await submit(post("{not json"))).status).toBe(400);
  });

  it("429 when the IP is over the limit (nothing stored)", async () => {
    limiter.hitRateLimit.mockResolvedValue({ allowed: false, count: 6, limit: 5, retryAfterSec: 120 });
    const res = await submit(post(form()));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("120");
    expect(db.corporateRequest.create).not.toHaveBeenCalled();
    expect(alerts.alertCorporateRequest).not.toHaveBeenCalled();
  });

  it("a database failure is a 500 without alerts", async () => {
    db.corporateRequest.create.mockRejectedValue(new Error("db down"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await submit(post(form()))).status).toBe(500);
    expect(alerts.alertCorporateRequest).not.toHaveBeenCalled();
    err.mockRestore();
  });
});

describe("admin access control (super admin only)", () => {
  const cases = () => [
    () => list(adminReq("/api/admin/corporate-requests")),
    () => count(),
    () => getOne(adminReq(`/api/admin/corporate-requests/${ROW.id}`), params({ id: ROW.id })),
    () =>
      patchOne(
        adminReq(`/api/admin/corporate-requests/${ROW.id}`, { method: "PATCH", body: JSON.stringify({ status: "won" }) }),
        params({ id: ROW.id }),
      ),
    () => getFile(adminReq(`/api/admin/corporate-requests/${ROW.id}/files/0`), params({ id: ROW.id, index: "0" })),
  ];

  it("401 for anonymous visitors, dealers and staff below super admin", async () => {
    for (const user of [null, ...["dealer", "customer", "admin", "workshop"].map((role) => ({ ...STAFF, role }))]) {
      auth.getSessionUser.mockResolvedValue(user);
      for (const call of cases()) expect((await call()).status).toBe(401);
    }
    expect(db.corporateRequest.findMany).not.toHaveBeenCalled();
    expect(db.corporateRequest.update).not.toHaveBeenCalled();
  });

  it("super admin gets the list with filters", async () => {
    {
      auth.getSessionUser.mockResolvedValue(STAFF);
      db.corporateRequest.findMany.mockResolvedValue([ROW]);
      db.corporateRequest.count.mockResolvedValue(1);
      db.corporateRequest.groupBy.mockResolvedValue([{ status: "new", _count: { _all: 1 } }]);
      const res = await list(adminReq("/api/admin/corporate-requests?status=open&q=orange"));
      expect(res.status).toBe(200);
      const body = (await res.json()) as { rows: { number: number; fileCount: number; deadline: string }[]; counts: Record<string, number> };
      expect(body.rows[0]).toMatchObject({ number: 12, fileCount: 1, deadline: "2026-12-01" });
      expect(body.counts).toEqual({ new: 1, in_work: 0, offer_sent: 0, won: 0, lost: 0 });
    }
    const where = db.corporateRequest.findMany.mock.calls[0]![0].where;
    expect(JSON.stringify(where)).toContain('"in":["new","in_work","offer_sent"]');
    expect(JSON.stringify(where)).toContain('"contains":"orange"');
  });

  it("count of new requests for the nav badge", async () => {
    auth.getSessionUser.mockResolvedValue(STAFF);
    db.corporateRequest.count.mockResolvedValue(3);
    expect(await (await count()).json()).toEqual({ new: 3 });
    expect(db.corporateRequest.count).toHaveBeenCalledWith({ where: { status: "new" } });
  });

  it("detail matches a studio client for «Создать заказ»", async () => {
    auth.getSessionUser.mockResolvedValue(STAFF);
    db.corporateRequest.findUnique.mockResolvedValue(ROW);
    db.studioCustomer.findFirst.mockResolvedValue({ id: "c1", companyName: "Orange", personName: null });
    const res = await getOne(adminReq(`/api/admin/corporate-requests/${ROW.id}`), params({ id: ROW.id }));
    const body = (await res.json()) as { matchedClient: unknown; files: unknown[] };
    expect(body.matchedClient).toEqual({ id: "c1", name: "Orange" });
    // File keys stay server-side.
    expect(body.files).toEqual([{ name: "logo.ai", size: 5000 }]);
    db.corporateRequest.findUnique.mockResolvedValue(null);
    expect((await getOne(adminReq("/api/admin/corporate-requests/x"), params({ id: "x" }))).status).toBe(404);
  });

  it("file download redirects to a signed URL of that request's file only", async () => {
    auth.getSessionUser.mockResolvedValue(STAFF);
    db.corporateRequest.findUnique.mockResolvedValue({ files: ROW.files });
    const res = await getFile(adminReq("/x"), params({ id: ROW.id, index: "0" }));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://r2.example/corporate-requests/9-x-logo.ai?sig=1");
    expect((await getFile(adminReq("/x"), params({ id: ROW.id, index: "1" }))).status).toBe(404);
    expect((await getFile(adminReq("/x"), params({ id: ROW.id, index: "-1" }))).status).toBe(404);
  });
});

describe("PATCH status / assignee / notes", () => {
  const patch = (body: unknown) =>
    patchOne(
      adminReq(`/api/admin/corporate-requests/${ROW.id}`, { method: "PATCH", body: JSON.stringify(body) }),
      params({ id: ROW.id }),
    );

  beforeEach(() => {
    auth.getSessionUser.mockResolvedValue(STAFF);
    db.corporateRequest.findUnique.mockResolvedValue({ status: "new" });
    db.corporateRequest.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      status: data.status ?? "new",
      assigneeId: data.assigneeId ?? null,
      notes: data.notes ?? null,
    }));
  });

  it("a new status is stamped with the time", async () => {
    const res = await patch({ status: "offer_sent" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "offer_sent", assigneeId: null, notes: null });
    const data = db.corporateRequest.update.mock.calls[0]![0].data;
    expect(data.status).toBe("offer_sent");
    expect(data.statusChangedAt).toBeInstanceOf(Date);
  });

  it("the same status does not move the timestamp", async () => {
    await patch({ status: "new", notes: "sunat, revine luni" });
    const data = db.corporateRequest.update.mock.calls[0]![0].data;
    expect(data).toEqual({ notes: "sunat, revine luni" });
  });

  it("assignee must be a staff user; null clears it; blank notes clear them", async () => {
    const staffId = "22222222-2222-4222-8222-222222222222";
    db.user.findUnique.mockResolvedValueOnce({ role: "workshop" });
    expect((await patch({ assigneeId: staffId })).status).toBe(200);
    db.user.findUnique.mockResolvedValueOnce({ role: "customer" });
    expect((await patch({ assigneeId: staffId })).status).toBe(400);
    expect((await patch({ assigneeId: null, notes: "  " })).status).toBe(200);
    expect(db.corporateRequest.update.mock.calls.at(-1)![0].data).toEqual({ assigneeId: null, notes: null });
  });

  it("400 for unknown statuses or fields, 404 for unknown requests", async () => {
    expect((await patch({ status: "archived" })).status).toBe(400);
    expect((await patch({ email: "x@y.z" })).status).toBe(400);
    expect((await patch({})).status).toBe(400);
    db.corporateRequest.findUnique.mockResolvedValue(null);
    expect((await patch({ status: "won" })).status).toBe(404);
    expect(db.corporateRequest.update).not.toHaveBeenCalled();
  });
});

describe("thank-you page number (?nr=)", () => {
  it("only a real request from the last day; junk never reaches the DB", async () => {
    const now = new Date("2026-11-05T10:00:00Z");
    for (const nr of [undefined, "", "abc", "12a", "-1", "1e3", "1234567890"]) {
      expect(await isRecentCorporateRequestNumber(nr, now), String(nr)).toBe(false);
    }
    expect(db.corporateRequest.findFirst).not.toHaveBeenCalled();

    db.corporateRequest.findFirst.mockResolvedValueOnce(null);
    expect(await isRecentCorporateRequestNumber("99999", now)).toBe(false);
    db.corporateRequest.findFirst.mockResolvedValueOnce({ id: ROW.id });
    expect(await isRecentCorporateRequestNumber("12", now)).toBe(true);
    expect(db.corporateRequest.findFirst).toHaveBeenLastCalledWith({
      where: { number: 12, createdAt: { gte: new Date("2026-11-04T10:00:00Z") } },
      select: { id: true },
    });
    db.corporateRequest.findFirst.mockRejectedValueOnce(new Error("db down"));
    expect(await isRecentCorporateRequestNumber("12", now)).toBe(false);
  });
});
