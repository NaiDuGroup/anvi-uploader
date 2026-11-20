/**
 * Workshop board «Весь заказ» panel: `GET /api/workshop-board/order/[id]`.
 * Same roles as the board page (workshop + super admin); the workshop gets no
 * prices / payment / money history and only workshop orders; studio admin,
 * other staff roles get 403, a dealer (cabinet session only) 401.
 *
 * Route handlers run in-process with real sessions against a LOCAL database
 * (refuses any other DATABASE_URL). Run with
 * `npx vitest run --config vitest.integration.config.ts tests/integration/workshop-order-overview.test.ts`.
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
import { GET as getOverview } from "@/app/api/workshop-board/order/[id]/route";
import type { WorkshopOrderOverview } from "@/lib/workshopBoard/orderOverviewTypes";
import { cleanupTestMugs, createTestMug } from "./mugSeed";
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
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

const stamp = `${Date.now()}`.slice(-7);
/** An unusual amount: must never appear in the workshop's response. */
const PRICE = 7349.25;

type Role = "admin" | "workshop" | "superadmin" | "viewer";

describe.skipIf(!isLocalDb)("integration: workshop board order overview panel", () => {
  let mugId: string;
  let lf: TestLfMaterial;
  let dealerCustomerId: string;
  let dealerUserId: string;
  let dealerToken: string;
  const users = {} as Record<Role, { id: string; token: string }>;
  const phone = `+3736${stamp}1`;
  let order: { id: string; orderNumber: number };

  beforeAll(async () => {
    mugId = (await createTestMug(200, { sellPrice: 100, skuPrefix: "IT-WOO" })).id;
    lf = await createTestLfMaterial(`IT WOO BANNER ${stamp}`, { stockLm: 100 });
    for (const role of ["admin", "workshop", "superadmin", "viewer"] as const) {
      const u = await prisma.user.create({
        data: { name: `it-woo-${role}-${stamp}@anvi.test`, role, password: hashPassword("x") },
      });
      users[role] = { id: u.id, token: await createSession(u.id) };
    }
    const customer = await prisma.studioCustomer.create({
      data: { kind: "INDIVIDUAL", phone: `+3736${stamp}2`, personName: `IT woo ${stamp}`, isDealer: true },
    });
    dealerCustomerId = customer.id;
    const dealer = await prisma.user.create({
      data: {
        name: `it-woo-dealer-${stamp}@anvi.test`,
        role: "customer",
        password: hashPassword("x"),
        studioCustomerId: customer.id,
      },
    });
    dealerUserId = dealer.id;
    dealerToken = await createSession(dealer.id);

    cookieJar.admin = users.admin.token;
    const res = await createAdminOrder(
      req("/api/admin/orders", "POST", {
        phone,
        clientName: `IT WOO client ${stamp}`,
        notes: "Упаковать отдельно",
        lines: [
          {
            productType: "mug",
            mugProductId: mugId,
            mugLayoutData: layout,
            files: [{ fileName: "mug.png", fileUrl: `uploads/it-woo/mug-${stamp}.png`, copies: 1, color: "color" }],
          },
          {
            productType: "large_format_print",
            largeFormatMaterialId: lf.id,
            printWidthCm: 50,
            printHeightCm: 70,
            quantity: 2,
            customerType: "retail",
            files: [{ fileName: "banner.pdf", fileUrl: `uploads/it-woo/banner-${stamp}.pdf`, copies: 1, color: "color" }],
          },
        ],
      }),
    );
    const body = (await res.json()) as { id: string; orderNumber: number; status: string };
    expect(res.status, JSON.stringify(body)).toBe(201);
    expect(body.status).toBe("SENT_TO_WORKSHOP");
    cookieJar.admin = null;
    order = body;
    // A price + paid flag and money history the workshop must not get.
    await prisma.order.update({ where: { id: order.id }, data: { price: PRICE, isPaid: true } });
    await prisma.orderLog.createMany({
      data: [
        { orderId: order.id, userId: users.admin.id, action: "field_updated", field: "price", oldValue: null, newValue: String(PRICE) },
        { orderId: order.id, userId: users.admin.id, action: "field_updated", field: "isPaid", oldValue: "false", newValue: "true" },
        { orderId: order.id, userId: users.admin.id, action: "payment_mismatch", metadata: { paidMdl: PRICE, totalMdl: PRICE } },
      ],
    });
  });

  afterAll(async () => {
    await prisma.order.deleteMany({ where: { phone } });
    await cleanupTestMugs([mugId]);
    await cleanupTestLfMaterial(lf);
    await prisma.user.deleteMany({ where: { id: { in: [...Object.values(users).map((u) => u.id), dealerUserId] } } });
    await prisma.studioCustomer.deleteMany({ where: { id: dealerCustomerId } });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    cookieJar.customer = null;
    cookieJar.admin = null;
  });

  async function get(as: Role | "dealer" | null, id = order.id): Promise<{ status: number; text: string }> {
    cookieJar.admin = as && as !== "dealer" ? users[as].token : null;
    cookieJar.customer = as === "dealer" ? dealerToken : null;
    const res = await getOverview(req(`/api/workshop-board/order/${id}`, "GET"), ctx(id));
    return { status: res.status, text: await res.text() };
  }

  it("refuses everyone but the board roles", async () => {
    expect((await get(null)).status).toBe(401);
    // A dealer only has a cabinet session: no staff session at all.
    expect((await get("dealer")).status).toBe(401);
    expect((await get("admin")).status).toBe(403);
    expect((await get("viewer")).status).toBe(403);
  });

  it("workshop: every line, no money anywhere", async () => {
    const r = await get("workshop");
    expect(r.status, r.text).toBe(200);
    const data = JSON.parse(r.text) as WorkshopOrderOverview;
    expect(data.order.orderNumber).toBe(order.orderNumber);
    expect(data.order.phone).toBe(phone);
    expect(data.order.clientName).toBe(`IT WOO client ${stamp}`);
    expect(data.order.notes).toBe("Упаковать отдельно");
    expect(data.order.canEdit).toBe(true);
    expect(data.order).not.toHaveProperty("money");
    expect(data.lines.map((l) => [l.lineIndex, l.totalLines, l.productType])).toEqual([
      [1, 2, "mug"],
      [2, 2, "large_format_print"],
    ]);
    expect(data.lines.every((l) => l.board !== null)).toBe(true);
    expect(data.lines.map((l) => l.files.map((f) => f.fileName))).toEqual([["mug.png"], ["banner.pdf"]]);
    const lfLine = data.lines[1]!.board!;
    expect(lfLine.facts.kind).toBe("lf");
    // Money history dropped, and the amount appears nowhere in the payload.
    expect(data.history.some((h) => h.field === "price" || h.field === "isPaid" || h.action === "payment_mismatch")).toBe(false);
    expect(data.history.some((h) => h.action === "order_created")).toBe(true);
    expect(r.text).not.toContain("7349");
    expect(r.text).not.toMatch(/"(price|isPaid|priceMdl|paymentStatus)"/);
  });

  it("super admin: same lines plus price, paid flag and money history", async () => {
    const r = await get("superadmin");
    expect(r.status, r.text).toBe(200);
    const data = JSON.parse(r.text) as WorkshopOrderOverview;
    expect(data.lines).toHaveLength(2);
    expect(data.order.money).toEqual({ priceMdl: PRICE, isPaid: true });
    expect(data.history.some((h) => h.field === "price")).toBe(true);
  });

  it("workshop never opens a non-workshop order; super admin does; unknown id → 404", async () => {
    await prisma.order.update({ where: { id: order.id }, data: { isWorkshop: false } });
    try {
      expect((await get("workshop")).status).toBe(404);
      expect((await get("superadmin")).status).toBe(200);
    } finally {
      await prisma.order.update({ where: { id: order.id }, data: { isWorkshop: true } });
    }
    expect((await get("superadmin", "00000000-0000-0000-0000-000000000000")).status).toBe(404);
  });
});
