import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import {
  baseUrl,
  login,
  TEST_ADMIN,
  TEST_WORKSHOP,
} from "./helpers";

const shouldRun = Boolean(
  process.env.TEST_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL,
);

describe.skipIf(!shouldRun)("integration: HTTP API", () => {
  let adminCookie: string;
  let workshopCookie: string;
  let adminUserId: string;

  beforeAll(async () => {
    const a = await login(TEST_ADMIN.name, TEST_ADMIN.password);
    adminCookie = a.cookie;
    const w = await login(TEST_WORKSHOP.name, TEST_WORKSHOP.password);
    workshopCookie = w.cookie;

    const adminUser = await prisma.user.findFirst({
      where: { name: TEST_ADMIN.name },
    });
    if (!adminUser) throw new Error("Test admin user missing — run prisma/seed-test-users");
    adminUserId = adminUser.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("GET /api/orders without session returns 401", async () => {
    const res = await fetch(`${baseUrl()}/api/orders`);
    expect(res.status).toBe(401);
  });

  it("POST /api/orders creates order with NEW status", async () => {
    const phone = `+3737${Date.now().toString().slice(-8)}`;
    const res = await fetch(`${baseUrl()}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone,
        notes: "integration test",
        files: [
          {
            fileName: "test.pdf",
            fileUrl: "uploads/integration-test-key",
            copies: 1,
            color: "bw",
            paperType: "A4",
          },
        ],
      }),
    });
    expect(res.status).toBe(201);
    const order = await res.json();
    expect(order.status).toBe("NEW");
    expect(order.isWorkshop).toBe(false);
    expect(order.phone).toBe(phone);

    await prisma.order.delete({ where: { id: order.id } });
  });

  it("GET /api/track/:token returns not_found for unknown token", async () => {
    const res = await fetch(`${baseUrl()}/api/track/${nanoid(21)}`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
  });

  it("GET /api/track/:token returns expired for past expiresAt", async () => {
    const token = nanoid(21);
    const order = await prisma.order.create({
      data: {
        phone: "+37371234567",
        publicToken: token,
        expiresAt: new Date(Date.now() - 86_400_000),
        status: "NEW",
        files: {
          create: [
            {
              fileName: "expired.pdf",
              fileUrl: "uploads/expired-key",
              copies: 1,
              color: "bw",
            },
          ],
        },
      },
    });

    const res = await fetch(`${baseUrl()}/api/track/${token}`);
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.error).toBe("expired");

    await prisma.order.delete({ where: { id: order.id } });
  });

  it("admin PATCH SENT_TO_WORKSHOP sets isWorkshop and sentToWorkshopBy", async () => {
    const order = await prisma.order.create({
      data: {
        phone: "+37379998877",
        publicToken: nanoid(21),
        expiresAt: new Date(Date.now() + 86_400_000),
        status: "NEW",
        files: {
          create: [
            {
              fileName: "w.pdf",
              fileUrl: "uploads/w-key",
              copies: 1,
              color: "color",
            },
          ],
        },
      },
    });

    const patch = await fetch(`${baseUrl()}/api/orders/${order.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminCookie,
      },
      body: JSON.stringify({ status: "SENT_TO_WORKSHOP" }),
    });
    expect(patch.status).toBe(200);
    const updated = await patch.json();
    expect(updated.status).toBe("SENT_TO_WORKSHOP");
    expect(updated.isWorkshop).toBe(true);
    expect(updated.sentToWorkshopBy).toBe(adminUserId);

    await prisma.order.delete({ where: { id: order.id } });
  });

  it("workshop cannot PATCH phone", async () => {
    const order = await prisma.order.create({
      data: {
        phone: "+37371112233",
        publicToken: nanoid(21),
        expiresAt: new Date(Date.now() + 86_400_000),
        status: "SENT_TO_WORKSHOP",
        isWorkshop: true,
        files: {
          create: [
            {
              fileName: "p.pdf",
              fileUrl: "uploads/p-key",
              copies: 1,
              color: "bw",
            },
          ],
        },
      },
    });

    const patch = await fetch(`${baseUrl()}/api/orders/${order.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: workshopCookie,
      },
      body: JSON.stringify({ phone: "+37379999999" }),
    });
    expect(patch.status).toBe(403);

    await prisma.order.delete({ where: { id: order.id } });
  });

  it("workshop can PATCH allowed status on workshop order", async () => {
    const order = await prisma.order.create({
      data: {
        phone: "+37374445566",
        publicToken: nanoid(21),
        expiresAt: new Date(Date.now() + 86_400_000),
        status: "SENT_TO_WORKSHOP",
        isWorkshop: true,
        files: {
          create: [
            {
              fileName: "q.pdf",
              fileUrl: "uploads/q-key",
              copies: 1,
              color: "bw",
            },
          ],
        },
      },
    });

    const patch = await fetch(`${baseUrl()}/api/orders/${order.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: workshopCookie,
      },
      body: JSON.stringify({ status: "WORKSHOP_PRINTING" }),
    });
    expect(patch.status).toBe(200);
    const updated = await patch.json();
    expect(updated.status).toBe("WORKSHOP_PRINTING");

    await prisma.order.delete({ where: { id: order.id } });
  });

  it("admin PATCH IN_PROGRESS clears isWorkshop", async () => {
    const order = await prisma.order.create({
      data: {
        phone: "+37376667788",
        publicToken: nanoid(21),
        expiresAt: new Date(Date.now() + 86_400_000),
        status: "SENT_TO_WORKSHOP",
        isWorkshop: true,
        files: {
          create: [
            {
              fileName: "r.pdf",
              fileUrl: "uploads/r-key",
              copies: 1,
              color: "bw",
            },
          ],
        },
      },
    });

    const patch = await fetch(`${baseUrl()}/api/orders/${order.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminCookie,
      },
      body: JSON.stringify({ status: "IN_PROGRESS" }),
    });
    expect(patch.status).toBe(200);
    const updated = await patch.json();
    expect(updated.isWorkshop).toBe(false);

    await prisma.order.delete({ where: { id: order.id } });
  });

  it("admin PATCH DELIVERED clears isPrio", async () => {
    const order = await prisma.order.create({
      data: {
        phone: "+37378889900",
        publicToken: nanoid(21),
        expiresAt: new Date(Date.now() + 86_400_000),
        status: "RETURNED_TO_STUDIO",
        isPrio: true,
        files: {
          create: [
            {
              fileName: "prio.pdf",
              fileUrl: "uploads/prio-key",
              copies: 1,
              color: "bw",
            },
          ],
        },
      },
    });

    const patch = await fetch(`${baseUrl()}/api/orders/${order.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminCookie,
      },
      body: JSON.stringify({ status: "DELIVERED" }),
    });
    expect(patch.status).toBe(200);
    const updated = await patch.json();
    expect(updated.status).toBe("DELIVERED");
    expect(updated.isPrio).toBe(false);

    await prisma.order.delete({ where: { id: order.id } });
  });
});
