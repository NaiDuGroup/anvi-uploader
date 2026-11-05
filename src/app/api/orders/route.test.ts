import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const auth = vi.hoisted(() => ({
  getSessionUser: vi.fn(async (): Promise<unknown> => null),
  getMaybeCustomerUser: vi.fn(async (): Promise<unknown> => null),
}));
vi.mock("@/lib/auth", () => auth);
vi.mock("@/lib/rateLimit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rateLimit")>()),
  hitRateLimit: vi.fn(async () => ({ allowed: true, count: 1, limit: 20, retryAfterSec: 1 })),
}));
vi.mock("@/lib/turnstile/guard", () => ({ guardUploaderTurnstile: vi.fn(async () => null) }));
vi.mock("@/lib/findClientByOrderPhone", () => ({ findClientIdByOrderPhone: vi.fn(async () => "client-1") }));

const fullOrder = {
  id: "o1",
  orderNumber: 4242,
  publicToken: "tok_abcdefghijklmnopqrs",
  phone: "079545631",
  clientId: "client-1",
  price: null,
  consentAt: null,
  consentVersion: null,
  needsProcurement: false,
  files: [],
  orderLines: [],
};
const db = vi.hoisted(() => ({ fail: null as Error | null }));
vi.mock("@/lib/prisma", () => {
  const tx = {
    order: {
      create: vi.fn(async () => ({ id: "o1", orderNumber: 4242 })),
      findUniqueOrThrow: vi.fn(async () => fullOrder),
      update: vi.fn(async () => fullOrder),
    },
    orderLine: { create: vi.fn(async () => ({})), findMany: vi.fn(async () => []) },
    orderLog: { create: vi.fn(async () => ({})) },
  };
  return {
    HEAVY_TX_OPTIONS: {},
    prisma: {
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => {
        if (db.fail) throw db.fail;
        return fn(tx);
      }),
    },
  };
});

import { POST } from "./route";

const KEY = "uploads/1778657608040-zAnrGJal-doc.pdf";
const file = { fileName: "doc.pdf", fileUrl: KEY, copies: 1, color: "bw", paperType: "A4" };

function post(body: unknown, raw?: string) {
  return new NextRequest("https://print.anvi.md/api/orders", {
    method: "POST",
    body: raw ?? JSON.stringify(body),
    headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.9" },
  });
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  db.fail = null;
  auth.getSessionUser.mockResolvedValue(null);
  vi.restoreAllMocks();
});

describe("POST /api/orders (guest hardening)", () => {
  it("guest 201 carries only id, orderNumber and publicToken", async () => {
    const res = await POST(post({ phone: "079 545 631", files: [file] }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "o1", orderNumber: 4242, publicToken: "tok_abcdefghijklmnopqrs" });
  });

  it("staff caller still gets the full order", async () => {
    auth.getSessionUser.mockResolvedValue({ id: "u1", role: "admin" });
    const res = await POST(post({ phone: "079545631", files: [{ ...file, fileUrl: "uploads/legacy-key" }] }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.clientId).toBe("client-1");
    expect(body).not.toHaveProperty("consentAt");
  });

  it("schema errors return field paths only", async () => {
    const res = await POST(post({ phone: "079545631", files: [{ ...file, copies: "many" }] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "Validation failed", fields: ["files.0.copies"] });
  });

  it("invalid JSON is a 400 without parser text", async () => {
    const res = await POST(post(null, "{not json"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON" });
  });

  it("guest fileUrl must be an upload key or an http(s) link", async () => {
    for (const fileUrl of ["javascript:alert(1)", "data:text/html,x", "catalog/mugs/1-a.png", "uploads/x"]) {
      const res = await POST(post({ phone: "079545631", files: [{ ...file, fileUrl }] }));
      expect(res.status, fileUrl).toBe(400);
      expect(await res.json()).toEqual({ error: "Validation failed", fields: ["files.0.fileUrl"] });
    }
    const link = await POST(post({ phone: "079545631", files: [{ ...file, fileUrl: "https://drive.google.com/x" }] }));
    expect(link.status).toBe(201);
  });

  it("guest copies and phone bounds", async () => {
    const many = await POST(post({ phone: "079545631", files: [{ ...file, copies: 100_000 }] }));
    expect(await many.json()).toMatchObject({ fields: ["files.0.copies"] });
    const mugs = await POST(
      post({ phone: "079545631", productType: "mug", mugOther: true, files: [{ ...file, copies: 5000 }] }),
    );
    expect(mugs.status).toBe(400);
    const phone = await POST(post({ phone: "Naddy Instagram", files: [file] }));
    expect(await phone.json()).toEqual({ error: "Validation failed", fields: ["phone"] });
  });

  it("500 hides internal error text from guests, keeps it for staff", async () => {
    db.fail = new Error('relation "orders" does not exist');
    const guest = await POST(post({ phone: "079545631", files: [file] }));
    expect(guest.status).toBe(500);
    expect(await guest.json()).toEqual({ error: "Failed to create order" });
    auth.getSessionUser.mockResolvedValue({ id: "u1", role: "admin" });
    const staff = await POST(post({ phone: "079545631", files: [file] }));
    expect(await staff.json()).toMatchObject({ detail: 'relation "orders" does not exist' });
  });
});
