import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes } from "crypto";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { baseUrl, login, TEST_ADMIN } from "./helpers";
import { seedOrderWithFiles } from "./orderSeed";

const CUSTOMER_SESSION_COOKIE = "customer_session";

const shouldRun = Boolean(
  process.env.TEST_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL,
);

type TestCustomer = { customerId: string; userId: string; cookie: string };

interface MessageDTO {
  id: string;
  text: string;
  isStaff: boolean;
  isOwn: boolean;
}

describe.skipIf(!shouldRun)("integration: client <-> studio messages", () => {
  let adminCookie: string;
  let owner: TestCustomer;
  let other: TestCustomer;
  let orderId: string;
  const createdOrderIds: string[] = [];

  async function createCustomer(suffix: string): Promise<TestCustomer> {
    const customer = await prisma.studioCustomer.create({
      data: { kind: "person", personName: `CM Test ${suffix}` },
    });
    const user = await prisma.user.create({
      data: {
        name: `cm-${suffix}-${Date.now()}@anvi.test`,
        password: "unused-direct-session",
        role: "customer",
        studioCustomerId: customer.id,
        phoneNormalized: `cm-${suffix}-${Date.now()}`,
      },
    });
    const token = randomBytes(32).toString("hex");
    await prisma.session.create({
      data: { userId: user.id, token, expiresAt: new Date(Date.now() + 86_400_000) },
    });
    return {
      customerId: customer.id,
      userId: user.id,
      cookie: `${CUSTOMER_SESSION_COOKIE}=${token}`,
    };
  }

  async function seedOwnedOrder(ownerCustomer: TestCustomer): Promise<string> {
    const order = await seedOrderWithFiles(
      {
        phone: "+37360000001",
        publicToken: nanoid(21),
        expiresAt: new Date(Date.now() + 86_400_000),
        status: "NEW",
        clientId: ownerCustomer.customerId,
        createdBy: ownerCustomer.userId,
      },
      [
        {
          fileName: "cm.pdf",
          fileUrl: `uploads/cm-${nanoid(8)}`,
          copies: 1,
          color: "bw",
          paperType: "A4",
        },
      ],
    );
    createdOrderIds.push(order.id);
    return order.id;
  }

  beforeAll(async () => {
    adminCookie = (await login(TEST_ADMIN.name, TEST_ADMIN.password)).cookie;
    owner = await createCustomer("owner");
    other = await createCustomer("other");
    orderId = await seedOwnedOrder(owner);
  });

  afterAll(async () => {
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
    await prisma.user.deleteMany({
      where: { id: { in: [owner.userId, other.userId] } },
    });
    await prisma.studioCustomer.deleteMany({
      where: { id: { in: [owner.customerId, other.customerId] } },
    });
    await prisma.$disconnect();
  });

  it("requires a customer session", async () => {
    const res = await fetch(
      `${baseUrl()}/api/cabinet/orders/${orderId}/messages`,
    );
    expect(res.status).toBe(401);
  });

  it("rejects access to another client's order", async () => {
    const get = await fetch(
      `${baseUrl()}/api/cabinet/orders/${orderId}/messages`,
      { headers: { Cookie: other.cookie } },
    );
    expect(get.status).toBe(404);

    const post = await fetch(
      `${baseUrl()}/api/cabinet/orders/${orderId}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: other.cookie },
        body: JSON.stringify({ text: "should not be allowed" }),
      },
    );
    expect(post.status).toBe(404);
  });

  it("lets client and staff exchange messages with correct author flags", async () => {
    const clientPost = await fetch(
      `${baseUrl()}/api/cabinet/orders/${orderId}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: owner.cookie },
        body: JSON.stringify({ text: "Hello from the client" }),
      },
    );
    expect(clientPost.status).toBe(201);
    const clientMsg: MessageDTO = await clientPost.json();
    expect(clientMsg.isOwn).toBe(true);
    expect(clientMsg.isStaff).toBe(false);

    const staffGet = await fetch(`${baseUrl()}/api/orders/${orderId}/messages`, {
      headers: { Cookie: adminCookie },
    });
    expect(staffGet.status).toBe(200);
    const staffList: MessageDTO[] = await staffGet.json();
    const seenByStaff = staffList.find((m) => m.id === clientMsg.id);
    expect(seenByStaff).toBeTruthy();
    expect(seenByStaff?.isStaff).toBe(false);
    expect(seenByStaff?.isOwn).toBe(false);

    const staffPost = await fetch(
      `${baseUrl()}/api/orders/${orderId}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ text: "Hello from the studio" }),
      },
    );
    expect(staffPost.status).toBe(201);
    const staffMsg: MessageDTO = await staffPost.json();
    expect(staffMsg.isStaff).toBe(true);
    expect(staffMsg.isOwn).toBe(true);

    const clientGet = await fetch(
      `${baseUrl()}/api/cabinet/orders/${orderId}/messages`,
      { headers: { Cookie: owner.cookie } },
    );
    const clientList: MessageDTO[] = await clientGet.json();
    const replyForClient = clientList.find((m) => m.id === staffMsg.id);
    expect(replyForClient).toBeTruthy();
    expect(replyForClient?.isStaff).toBe(true);
    expect(replyForClient?.isOwn).toBe(false);
  });

  it("tracks and clears unread counts for both sides", async () => {
    const freshOrderId = await seedOwnedOrder(owner);

    // Staff writes first → client has an unread studio message.
    const staffPost = await fetch(
      `${baseUrl()}/api/orders/${freshOrderId}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ text: "Studio question" }),
      },
    );
    expect(staffPost.status).toBe(201);

    const unreadRes = await fetch(`${baseUrl()}/api/cabinet/unread`, {
      headers: { Cookie: owner.cookie },
    });
    const { totalUnread } = await unreadRes.json();
    expect(totalUnread).toBeGreaterThanOrEqual(1);

    const listRes = await fetch(`${baseUrl()}/api/cabinet/orders`, {
      headers: { Cookie: owner.cookie },
    });
    const { orders } = await listRes.json();
    const row = orders.find(
      (o: { id: string; unreadMessageCount: number }) => o.id === freshOrderId,
    );
    expect(row?.unreadMessageCount).toBeGreaterThanOrEqual(1);

    // Client opens the thread (GET marks read) → unread clears for the client.
    await fetch(`${baseUrl()}/api/cabinet/orders/${freshOrderId}/messages`, {
      headers: { Cookie: owner.cookie },
    });
    const listRes2 = await fetch(`${baseUrl()}/api/cabinet/orders`, {
      headers: { Cookie: owner.cookie },
    });
    const { orders: orders2 } = await listRes2.json();
    const row2 = orders2.find(
      (o: { id: string; unreadMessageCount: number }) => o.id === freshOrderId,
    );
    expect(row2?.unreadMessageCount).toBe(0);

    // Client replies → staff now has an unread client message.
    const clientPost = await fetch(
      `${baseUrl()}/api/cabinet/orders/${freshOrderId}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: owner.cookie },
        body: JSON.stringify({ text: "Client answer" }),
      },
    );
    expect(clientPost.status).toBe(201);

    const ordersApi = await fetch(`${baseUrl()}/api/orders?limit=100`, {
      headers: { Cookie: adminCookie },
    });
    const data = await ordersApi.json();
    const staffRow = data.orders.find(
      (o: { id: string; unreadClientMessageCount: number }) =>
        o.id === freshOrderId,
    );
    expect(staffRow?.unreadClientMessageCount).toBeGreaterThanOrEqual(1);
  });
});
