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

  // ── Workshop sidebar & pagination ────────────────────────────

  describe("GET /api/orders — pagination & workshopOrders", () => {
    const testPhone = `+37399${Date.now().toString().slice(-7)}`;
    const createdIds: string[] = [];

    async function createTestOrder(
      overrides: Partial<{
        status: string;
        isWorkshop: boolean;
        phone: string;
        createdBy: string;
      }> = {},
    ) {
      const order = await prisma.order.create({
        data: {
          phone: overrides.phone ?? testPhone,
          publicToken: nanoid(21),
          expiresAt: new Date(Date.now() + 86_400_000),
          status: overrides.status ?? "NEW",
          isWorkshop: overrides.isWorkshop ?? false,
          createdBy: overrides.createdBy ?? undefined,
          files: {
            create: [{ fileName: "t.pdf", fileUrl: "uploads/t-key", copies: 1, color: "bw" }],
          },
        },
      });
      createdIds.push(order.id);
      return order;
    }

    afterAll(async () => {
      if (createdIds.length > 0) {
        await prisma.file.deleteMany({ where: { orderId: { in: createdIds } } });
        await prisma.order.deleteMany({ where: { id: { in: createdIds } } });
      }
    });

    it("response contains pagination metadata", async () => {
      const res = await fetch(`${baseUrl()}/api/orders?limit=15`, {
        headers: { Cookie: adminCookie },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("page");
      expect(body).toHaveProperty("totalPages");
      expect(body).toHaveProperty("totalCount");
      expect(body).toHaveProperty("orders");
      expect(Array.isArray(body.orders)).toBe(true);
      expect(body.page).toBe(1);
    });

    it("limit param caps number of orders returned", async () => {
      const res = await fetch(`${baseUrl()}/api/orders?limit=15`, {
        headers: { Cookie: adminCookie },
      });
      const body = await res.json();
      expect(body.orders.length).toBeLessThanOrEqual(15);
    });

    it("invalid limit falls back to default page size", async () => {
      const res = await fetch(`${baseUrl()}/api/orders?limit=7`, {
        headers: { Cookie: adminCookie },
      });
      const body = await res.json();
      expect(body.orders.length).toBeLessThanOrEqual(15);
    });

    it("admin response includes workshopOrders field", async () => {
      const res = await fetch(`${baseUrl()}/api/orders`, {
        headers: { Cookie: adminCookie },
      });
      const body = await res.json();
      expect(body).toHaveProperty("workshopOrders");
      expect(Array.isArray(body.workshopOrders)).toBe(true);
    });

    it("workshop response does NOT include workshopOrders field", async () => {
      const res = await fetch(`${baseUrl()}/api/orders`, {
        headers: { Cookie: workshopCookie },
      });
      const body = await res.json();
      expect(body).not.toHaveProperty("workshopOrders");
    });

    it("workshopOrders only contains the 3 workshop statuses", async () => {
      await createTestOrder({ status: "SENT_TO_WORKSHOP", isWorkshop: true });
      await createTestOrder({ status: "WORKSHOP_PRINTING", isWorkshop: true });
      await createTestOrder({ status: "WORKSHOP_READY", isWorkshop: true });
      await createTestOrder({ status: "RETURNED_TO_STUDIO", isWorkshop: true });
      await createTestOrder({ status: "DELIVERED", isWorkshop: true });
      await createTestOrder({ status: "NEW", isWorkshop: false });

      const res = await fetch(`${baseUrl()}/api/orders`, {
        headers: { Cookie: adminCookie },
      });
      const body = await res.json();
      const wsStatuses = body.workshopOrders.map(
        (o: { status: string }) => o.status,
      );
      const allowed = new Set([
        "SENT_TO_WORKSHOP",
        "WORKSHOP_PRINTING",
        "WORKSHOP_READY",
      ]);
      for (const s of wsStatuses) {
        expect(allowed.has(s)).toBe(true);
      }
      const testIds = new Set(createdIds);
      const testWsOrders = body.workshopOrders.filter(
        (o: { id: string }) => testIds.has(o.id),
      );
      expect(testWsOrders.length).toBe(3);
    });

    it("workshopOrders excludes RETURNED_TO_STUDIO and DELIVERED", async () => {
      const returned = await createTestOrder({
        status: "RETURNED_TO_STUDIO",
        isWorkshop: true,
        phone: `+37388${Date.now().toString().slice(-7)}`,
      });
      const delivered = await createTestOrder({
        status: "DELIVERED",
        isWorkshop: true,
        phone: `+37388${Date.now().toString().slice(-7)}`,
      });

      const res = await fetch(`${baseUrl()}/api/orders`, {
        headers: { Cookie: adminCookie },
      });
      const body = await res.json();
      const wsIds = body.workshopOrders.map((o: { id: string }) => o.id);
      expect(wsIds).not.toContain(returned.id);
      expect(wsIds).not.toContain(delivered.id);
    });

    it("workshopOrders respects search filter", async () => {
      const uniquePhone = `+37377${Date.now().toString().slice(-7)}`;
      await createTestOrder({
        status: "SENT_TO_WORKSHOP",
        isWorkshop: true,
        phone: uniquePhone,
      });
      await createTestOrder({
        status: "WORKSHOP_PRINTING",
        isWorkshop: true,
        phone: "+37300000001",
      });

      const res = await fetch(
        `${baseUrl()}/api/orders?search=${uniquePhone}`,
        { headers: { Cookie: adminCookie } },
      );
      const body = await res.json();
      for (const o of body.workshopOrders) {
        expect((o as { phone: string }).phone).toContain(
          uniquePhone.slice(1),
        );
      }
    });

    it("workshopOrders respects onlyMine filter", async () => {
      await createTestOrder({
        status: "SENT_TO_WORKSHOP",
        isWorkshop: true,
        createdBy: adminUserId,
      });
      await createTestOrder({
        status: "WORKSHOP_READY",
        isWorkshop: true,
      });

      const res = await fetch(
        `${baseUrl()}/api/orders?onlyMine=true`,
        { headers: { Cookie: adminCookie } },
      );
      const body = await res.json();
      for (const o of body.workshopOrders) {
        expect((o as { createdBy: string | null }).createdBy).toBe(
          adminUserId,
        );
      }
    });

    it("page=2 returns different orders than page=1", async () => {
      const res1 = await fetch(`${baseUrl()}/api/orders?page=1&limit=15`, {
        headers: { Cookie: adminCookie },
      });
      const body1 = await res1.json();
      if (body1.totalPages < 2) return;

      const res2 = await fetch(`${baseUrl()}/api/orders?page=2&limit=15`, {
        headers: { Cookie: adminCookie },
      });
      const body2 = await res2.json();
      expect(body2.page).toBe(2);

      const ids1 = new Set(body1.orders.map((o: { id: string }) => o.id));
      for (const o of body2.orders) {
        expect(ids1.has((o as { id: string }).id)).toBe(false);
      }
    });

    it("out-of-range page returns empty orders with correct totalPages", async () => {
      const res = await fetch(`${baseUrl()}/api/orders?page=9999&limit=30`, {
        headers: { Cookie: adminCookie },
      });
      const body = await res.json();
      expect(body.orders.length).toBe(0);
      expect(body.totalPages).toBeGreaterThanOrEqual(0);
    });
  });

  // ── Search by order number ────────────────────────────────

  describe("GET /api/orders — search by order number", () => {
    it("finds order by its order number", async () => {
      const order = await prisma.order.create({
        data: {
          phone: "+37370000001",
          publicToken: nanoid(21),
          expiresAt: new Date(Date.now() + 86_400_000),
          status: "NEW",
          files: {
            create: [{ fileName: "s.pdf", fileUrl: "uploads/s-key", copies: 1, color: "bw" }],
          },
        },
      });

      const res = await fetch(
        `${baseUrl()}/api/orders?search=${order.orderNumber}`,
        { headers: { Cookie: adminCookie } },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      const ids = body.orders.map((o: { id: string }) => o.id);
      expect(ids).toContain(order.id);

      await prisma.order.delete({ where: { id: order.id } });
    });

    it("numeric search also matches phone numbers containing digits", async () => {
      const uniqueDigits = Date.now().toString().slice(-7);
      const order = await prisma.order.create({
        data: {
          phone: `+37399${uniqueDigits}`,
          publicToken: nanoid(21),
          expiresAt: new Date(Date.now() + 86_400_000),
          status: "NEW",
          files: {
            create: [{ fileName: "s2.pdf", fileUrl: "uploads/s2-key", copies: 1, color: "bw" }],
          },
        },
      });

      const res = await fetch(
        `${baseUrl()}/api/orders?search=${uniqueDigits}`,
        { headers: { Cookie: adminCookie } },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      const ids = body.orders.map((o: { id: string }) => o.id);
      expect(ids).toContain(order.id);

      await prisma.order.delete({ where: { id: order.id } });
    });
  });

  // ── File operations on PATCH ────────────────────────────────

  describe("PATCH /api/orders/:id — file operations", () => {
    it("admin can add new files to an order", async () => {
      const order = await prisma.order.create({
        data: {
          phone: "+37370000010",
          publicToken: nanoid(21),
          expiresAt: new Date(Date.now() + 86_400_000),
          status: "NEW",
          files: {
            create: [{ fileName: "orig.pdf", fileUrl: "uploads/orig-key", copies: 1, color: "bw" }],
          },
        },
        include: { files: true },
      });

      const patch = await fetch(`${baseUrl()}/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({
          addFiles: [
            { fileName: "added.pdf", fileUrl: "uploads/added-key", copies: 2, color: "color", paperType: "A3" },
          ],
        }),
      });
      expect(patch.status).toBe(200);
      const updated = await patch.json();
      expect(updated.files.length).toBe(2);
      const added = updated.files.find((f: { fileName: string }) => f.fileName === "added.pdf");
      expect(added).toBeTruthy();
      expect(added.copies).toBe(2);
      expect(added.color).toBe("color");
      expect(added.paperType).toBe("A3");

      await prisma.order.delete({ where: { id: order.id } });
    });

    it("admin can remove files from an order", async () => {
      const order = await prisma.order.create({
        data: {
          phone: "+37370000020",
          publicToken: nanoid(21),
          expiresAt: new Date(Date.now() + 86_400_000),
          status: "NEW",
          files: {
            create: [
              { fileName: "keep.pdf", fileUrl: "uploads/keep", copies: 1, color: "bw" },
              { fileName: "remove.pdf", fileUrl: "uploads/remove", copies: 1, color: "bw" },
            ],
          },
        },
        include: { files: true },
      });

      const fileToRemove = order.files.find((f) => f.fileName === "remove.pdf")!;
      const patch = await fetch(`${baseUrl()}/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ removeFileIds: [fileToRemove.id] }),
      });
      expect(patch.status).toBe(200);
      const updated = await patch.json();
      expect(updated.files.length).toBe(1);
      expect(updated.files[0].fileName).toBe("keep.pdf");

      await prisma.order.delete({ where: { id: order.id } });
    });

    it("admin can update file properties (copies, color, paperType)", async () => {
      const order = await prisma.order.create({
        data: {
          phone: "+37370000030",
          publicToken: nanoid(21),
          expiresAt: new Date(Date.now() + 86_400_000),
          status: "NEW",
          files: {
            create: [
              { fileName: "upd.pdf", fileUrl: "uploads/upd", copies: 1, color: "bw", paperType: "A4" },
            ],
          },
        },
        include: { files: true },
      });

      const fileId = order.files[0].id;
      const patch = await fetch(`${baseUrl()}/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({
          updateFiles: [{ id: fileId, copies: 50, color: "color", paperType: "A0" }],
        }),
      });
      expect(patch.status).toBe(200);
      const updated = await patch.json();
      const updatedFile = updated.files.find((f: { id: string }) => f.id === fileId);
      expect(updatedFile.copies).toBe(50);
      expect(updatedFile.color).toBe("color");
      expect(updatedFile.paperType).toBe("A0");

      await prisma.order.delete({ where: { id: order.id } });
    });

    it("admin can combine add, remove, update files in one PATCH", async () => {
      const order = await prisma.order.create({
        data: {
          phone: "+37370000040",
          publicToken: nanoid(21),
          expiresAt: new Date(Date.now() + 86_400_000),
          status: "NEW",
          files: {
            create: [
              { fileName: "stay.pdf", fileUrl: "uploads/stay", copies: 1, color: "bw" },
              { fileName: "gone.pdf", fileUrl: "uploads/gone", copies: 1, color: "bw" },
            ],
          },
        },
        include: { files: true },
      });

      const stayFile = order.files.find((f) => f.fileName === "stay.pdf")!;
      const goneFile = order.files.find((f) => f.fileName === "gone.pdf")!;

      const patch = await fetch(`${baseUrl()}/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({
          removeFileIds: [goneFile.id],
          updateFiles: [{ id: stayFile.id, copies: 10 }],
          addFiles: [
            { fileName: "brand-new.pdf", fileUrl: "uploads/brand-new", copies: 5, color: "color" },
          ],
        }),
      });
      expect(patch.status).toBe(200);
      const updated = await patch.json();
      expect(updated.files.length).toBe(2);

      const names = updated.files.map((f: { fileName: string }) => f.fileName).sort();
      expect(names).toEqual(["brand-new.pdf", "stay.pdf"]);

      const stayUpdated = updated.files.find((f: { id: string }) => f.id === stayFile.id);
      expect(stayUpdated.copies).toBe(10);

      await prisma.order.delete({ where: { id: order.id } });
    });

    it("admin can update order fields and files simultaneously", async () => {
      const order = await prisma.order.create({
        data: {
          phone: "+37370000050",
          publicToken: nanoid(21),
          expiresAt: new Date(Date.now() + 86_400_000),
          status: "NEW",
          files: {
            create: [{ fileName: "combo.pdf", fileUrl: "uploads/combo", copies: 1, color: "bw" }],
          },
        },
        include: { files: true },
      });

      const patch = await fetch(`${baseUrl()}/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({
          phone: "+37379999111",
          clientName: "Updated Name",
          price: 500,
          notes: "updated notes",
          updateFiles: [{ id: order.files[0].id, copies: 3, color: "color" }],
        }),
      });
      expect(patch.status).toBe(200);
      const updated = await patch.json();
      expect(updated.phone).toBe("+37379999111");
      expect(updated.clientName).toBe("Updated Name");
      expect(updated.price).toBe(500);
      expect(updated.notes).toBe("updated notes");
      expect(updated.files[0].copies).toBe(3);
      expect(updated.files[0].color).toBe("color");

      await prisma.order.delete({ where: { id: order.id } });
    });
  });

  // ── Workshop restrictions on file ops ────────────────────────

  describe("workshop cannot perform file operations", () => {
    it("workshop cannot add files", async () => {
      const order = await prisma.order.create({
        data: {
          phone: "+37370000060",
          publicToken: nanoid(21),
          expiresAt: new Date(Date.now() + 86_400_000),
          status: "SENT_TO_WORKSHOP",
          isWorkshop: true,
          files: {
            create: [{ fileName: "ws.pdf", fileUrl: "uploads/ws", copies: 1, color: "bw" }],
          },
        },
      });

      const patch = await fetch(`${baseUrl()}/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: workshopCookie },
        body: JSON.stringify({
          addFiles: [{ fileName: "hack.pdf", fileUrl: "uploads/hack", copies: 1, color: "bw" }],
        }),
      });
      expect(patch.status).toBe(403);

      await prisma.order.delete({ where: { id: order.id } });
    });

    it("workshop cannot remove files", async () => {
      const order = await prisma.order.create({
        data: {
          phone: "+37370000070",
          publicToken: nanoid(21),
          expiresAt: new Date(Date.now() + 86_400_000),
          status: "SENT_TO_WORKSHOP",
          isWorkshop: true,
          files: {
            create: [{ fileName: "ws2.pdf", fileUrl: "uploads/ws2", copies: 1, color: "bw" }],
          },
        },
        include: { files: true },
      });

      const patch = await fetch(`${baseUrl()}/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: workshopCookie },
        body: JSON.stringify({ removeFileIds: [order.files[0].id] }),
      });
      expect(patch.status).toBe(403);

      await prisma.order.delete({ where: { id: order.id } });
    });

    it("workshop cannot update file properties", async () => {
      const order = await prisma.order.create({
        data: {
          phone: "+37370000080",
          publicToken: nanoid(21),
          expiresAt: new Date(Date.now() + 86_400_000),
          status: "SENT_TO_WORKSHOP",
          isWorkshop: true,
          files: {
            create: [{ fileName: "ws3.pdf", fileUrl: "uploads/ws3", copies: 1, color: "bw" }],
          },
        },
        include: { files: true },
      });

      const patch = await fetch(`${baseUrl()}/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: workshopCookie },
        body: JSON.stringify({
          updateFiles: [{ id: order.files[0].id, copies: 999 }],
        }),
      });
      expect(patch.status).toBe(403);

      await prisma.order.delete({ where: { id: order.id } });
    });
  });

  // ── Price & payment ────────────────────────────────────────

  describe("PATCH /api/orders/:id — price and isPaid", () => {
    it("admin can set price on an order", async () => {
      const order = await prisma.order.create({
        data: {
          phone: "+37370000090",
          publicToken: nanoid(21),
          expiresAt: new Date(Date.now() + 86_400_000),
          status: "NEW",
          files: {
            create: [{ fileName: "pr.pdf", fileUrl: "uploads/pr", copies: 1, color: "bw" }],
          },
        },
      });

      const patch = await fetch(`${baseUrl()}/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ price: 350 }),
      });
      expect(patch.status).toBe(200);
      const updated = await patch.json();
      expect(updated.price).toBe(350);

      await prisma.order.delete({ where: { id: order.id } });
    });

    it("admin can toggle isPaid", async () => {
      const order = await prisma.order.create({
        data: {
          phone: "+37370000100",
          publicToken: nanoid(21),
          expiresAt: new Date(Date.now() + 86_400_000),
          status: "NEW",
          isPaid: false,
          files: {
            create: [{ fileName: "pay.pdf", fileUrl: "uploads/pay", copies: 1, color: "bw" }],
          },
        },
      });

      const patch1 = await fetch(`${baseUrl()}/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ isPaid: true }),
      });
      expect(patch1.status).toBe(200);
      expect((await patch1.json()).isPaid).toBe(true);

      const patch2 = await fetch(`${baseUrl()}/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ isPaid: false }),
      });
      expect(patch2.status).toBe(200);
      expect((await patch2.json()).isPaid).toBe(false);

      await prisma.order.delete({ where: { id: order.id } });
    });

    it("admin can set price to null (clear it)", async () => {
      const order = await prisma.order.create({
        data: {
          phone: "+37370000110",
          publicToken: nanoid(21),
          expiresAt: new Date(Date.now() + 86_400_000),
          status: "NEW",
          price: 100,
          files: {
            create: [{ fileName: "clr.pdf", fileUrl: "uploads/clr", copies: 1, color: "bw" }],
          },
        },
      });

      const patch = await fetch(`${baseUrl()}/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ price: null }),
      });
      expect(patch.status).toBe(200);
      expect((await patch.json()).price).toBeNull();

      await prisma.order.delete({ where: { id: order.id } });
    });

    it("workshop cannot set price or isPaid", async () => {
      const order = await prisma.order.create({
        data: {
          phone: "+37370000120",
          publicToken: nanoid(21),
          expiresAt: new Date(Date.now() + 86_400_000),
          status: "SENT_TO_WORKSHOP",
          isWorkshop: true,
          files: {
            create: [{ fileName: "wp.pdf", fileUrl: "uploads/wp", copies: 1, color: "bw" }],
          },
        },
      });

      const patch1 = await fetch(`${baseUrl()}/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: workshopCookie },
        body: JSON.stringify({ price: 999 }),
      });
      expect(patch1.status).toBe(403);

      const patch2 = await fetch(`${baseUrl()}/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: workshopCookie },
        body: JSON.stringify({ isPaid: true }),
      });
      expect(patch2.status).toBe(403);

      await prisma.order.delete({ where: { id: order.id } });
    });
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
