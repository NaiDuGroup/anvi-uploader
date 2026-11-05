/**
 * Saving a mug / notebook layout (`PATCH /api/admin/orders/[id]/mug-layout`,
 * `…/notebook-layout`) only rolls the order back to IN_PROGRESS in the studio
 * phase (and SENT_TO_WORKSHOP); a printing-or-later order keeps its status, so
 * dealer edit / cancel never re-opens on it.
 *
 * Route handlers run in-process against a LOCAL database (refuses any other
 * DATABASE_URL). Run with
 * `npx vitest run --config vitest.integration.config.ts tests/integration/layout-save-status.test.ts`.
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
import { POST as createCabinetOrder } from "@/app/api/cabinet/orders/route";
import { PATCH as patchMugLayout } from "@/app/api/admin/orders/[id]/mug-layout/route";
import { PATCH as patchNotebookLayout } from "@/app/api/admin/orders/[id]/notebook-layout/route";
import { canDealerModifyOrder } from "@/lib/dealerOrderModify";
import type { OrderStatus } from "@/lib/validations";
import { cleanupTestMugs, createTestMug } from "./mugSeed";
import { cleanupTestNotebook, createTestNotebook } from "./notebookSeed";

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

describe.skipIf(!isLocalDb)("integration: layout save keeps printing-or-later status", () => {
  let mugId: string;
  let notebookId: string;
  let customerId: string;
  let dealerUserId: string;
  let dealerToken: string;
  let staffId: string;
  let staffToken: string;

  beforeAll(async () => {
    mugId = (await createTestMug(40, { sellPrice: 100, skuPrefix: "IT-LAYOUT-ST" })).id;
    notebookId = (await createTestNotebook(40, "IT-LAYOUT-NB")).id;
    const customer = await prisma.studioCustomer.create({
      data: { kind: "INDIVIDUAL", phone: `+3735${stamp}1`, personName: `IT layout ${stamp}`, isDealer: true },
    });
    customerId = customer.id;
    const dealer = await prisma.user.create({
      data: { name: `it-layout-dealer-${stamp}@anvi.test`, role: "customer", password: hashPassword("x"), studioCustomerId: customer.id },
    });
    dealerUserId = dealer.id;
    dealerToken = await createSession(dealer.id);
    const staff = await prisma.user.create({
      data: { name: `it-layout-staff-${stamp}@anvi.test`, role: "admin", password: hashPassword("x") },
    });
    staffId = staff.id;
    staffToken = await createSession(staff.id);
  });

  afterAll(async () => {
    await prisma.order.deleteMany({ where: { clientId: customerId } });
    await cleanupTestMugs([mugId]);
    await cleanupTestNotebook(notebookId);
    await prisma.user.deleteMany({ where: { id: { in: [dealerUserId, staffId] } } });
    await prisma.studioCustomer.deleteMany({ where: { id: customerId } });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    cookieJar.customer = null;
    cookieJar.admin = null;
  });

  async function dealerOrder(kind: "mug" | "notebook", status: OrderStatus, isWorkshop: boolean) {
    cookieJar.customer = dealerToken;
    const line =
      kind === "mug"
        ? { productType: "mug", mugProductId: mugId, mugLayoutData: layout }
        : { productType: "notebook", notebookProductId: notebookId, notebookLayoutData: layout };
    const res = await createCabinetOrder(
      req("/api/cabinet/orders", "POST", {
        lines: [{ ...line, files: [{ fileName: "a.png", fileUrl: `uploads/it-layout/${kind}.png`, copies: 1, color: "color" }] }],
      }),
    );
    const body = (await res.json()) as { id: string };
    expect(res.status, JSON.stringify(body)).toBe(201);
    cookieJar.customer = null;
    return prisma.order.update({
      where: { id: body.id },
      data: { status, isWorkshop, approvalFeedback: "client wants bigger text" },
    });
  }

  async function saveLayout(kind: "mug" | "notebook", orderId: string) {
    cookieJar.admin = staffToken;
    const res =
      kind === "mug"
        ? await patchMugLayout(
            req(`/api/admin/orders/${orderId}/mug-layout`, "PATCH", {
              mugLayoutData: layout,
              fileUrl: "uploads/it-layout/mug-2.png",
              fileName: "mug-2.png",
            }),
            ctx(orderId),
          )
        : await patchNotebookLayout(
            req(`/api/admin/orders/${orderId}/notebook-layout`, "PATCH", {
              notebookLayoutData: layout,
              fileUrl: "uploads/it-layout/nb-2.png",
              fileName: "nb-2.png",
            }),
            ctx(orderId),
          );
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);
    cookieJar.admin = null;
    const after = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { files: true, logs: { where: { action: "status_changed" } } },
    });
    return after;
  }

  for (const kind of ["mug", "notebook"] as const) {
    for (const status of ["WORKSHOP_PRINTING", "WORKSHOP_READY", "READY_IN_STUDIO", "DELIVERED"] as const) {
      it(`${kind}: re-saving on ${status} keeps status, isWorkshop, feedback; dealer stays locked`, async () => {
        const order = await dealerOrder(kind, status, true);
        expect(canDealerModifyOrder(order)).toBe(false);
        const after = await saveLayout(kind, order.id);
        expect(after.status).toBe(status);
        expect(after.isWorkshop).toBe(true);
        expect(after.approvalFeedback).toBe("client wants bigger text");
        expect(after.logs).toHaveLength(0);
        // The layout itself was saved.
        expect(after.files.map((f) => f.fileName)).toEqual([kind === "mug" ? "mug-2.png" : "nb-2.png"]);
        expect(canDealerModifyOrder(after)).toBe(false);
      });
    }

    it(`${kind}: studio phase (ISSUE) goes back to IN_PROGRESS, clears feedback, logs it`, async () => {
      const order = await dealerOrder(kind, "ISSUE", false);
      const after = await saveLayout(kind, order.id);
      expect(after.status).toBe("IN_PROGRESS");
      expect(after.approvalFeedback).toBeNull();
      expect(after.logs.map((l) => [l.oldValue, l.newValue])).toEqual([["ISSUE", "IN_PROGRESS"]]);
    });

    it(`${kind}: SENT_TO_WORKSHOP keeps the «redo before workshop» rollback, isWorkshop untouched`, async () => {
      const order = await dealerOrder(kind, "SENT_TO_WORKSHOP", true);
      const after = await saveLayout(kind, order.id);
      expect(after.status).toBe("IN_PROGRESS");
      expect(after.isWorkshop).toBe(true);
      expect(after.logs.map((l) => [l.oldValue, l.newValue])).toEqual([["SENT_TO_WORKSHOP", "IN_PROGRESS"]]);
    });

    it(`${kind}: IN_PROGRESS stays IN_PROGRESS without a status log`, async () => {
      const order = await dealerOrder(kind, "IN_PROGRESS", false);
      const after = await saveLayout(kind, order.id);
      expect(after.status).toBe("IN_PROGRESS");
      expect(after.approvalFeedback).toBeNull();
      expect(after.logs).toHaveLength(0);
    });
  }
});
