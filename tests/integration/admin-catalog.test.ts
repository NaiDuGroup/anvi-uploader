/**
 * Catalog HTTP: requires workshop or superadmin (not studio admin).
 * Prerequisites: see tests/integration/helpers.ts / AGENTS.md
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import {
  baseUrl,
  login,
  TEST_ADMIN,
  TEST_SUPERADMIN,
  TEST_WORKSHOP,
} from "./helpers";

const shouldRun = Boolean(
  process.env.TEST_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL,
);

describe.skipIf(!shouldRun)("integration: admin catalog (mug + notebook)", () => {
  let superCookie: string;
  let adminCookie: string;
  let workshopCookie: string;

  beforeAll(async () => {
    superCookie = (
      await login(TEST_SUPERADMIN.name, TEST_SUPERADMIN.password)
    ).cookie;
    adminCookie = (await login(TEST_ADMIN.name, TEST_ADMIN.password)).cookie;
    workshopCookie = (
      await login(TEST_WORKSHOP.name, TEST_WORKSHOP.password)
    ).cookie;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function cleanupMug(id: string) {
    await prisma.mugStockMovement.deleteMany({ where: { mugProductId: id } });
    await prisma.mugProduct.deleteMany({ where: { id } });
  }

  async function cleanupNotebook(id: string) {
    await prisma.notebookStockMovement.deleteMany({
      where: { notebookProductId: id },
    });
    await prisma.notebookProduct.deleteMany({ where: { id } });
  }

  it("GET /api/admin/mug-products — 401 for studio admin, 200 for superadmin", async () => {
    const denied = await fetch(`${baseUrl()}/api/admin/mug-products`, {
      headers: { Cookie: adminCookie },
    });
    expect(denied.status).toBe(401);

    const ok = await fetch(`${baseUrl()}/api/admin/mug-products`, {
      headers: { Cookie: superCookie },
    });
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { items: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
  });

  it("GET /api/admin/notebook-products — 401 for studio admin", async () => {
    const denied = await fetch(`${baseUrl()}/api/admin/notebook-products`, {
      headers: { Cookie: adminCookie },
    });
    expect(denied.status).toBe(401);
  });

  it("mug: POST, PATCH, duplicate", async () => {
    const sku = `IT-MCAT-${Date.now()}-${nanoid(4)}`.toUpperCase();
    const post = await fetch(`${baseUrl()}/api/admin/mug-products`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: superCookie,
      },
      body: JSON.stringify({
        sku,
        nameRo: "T",
        nameRu: "T",
        nameEn: "T",
      }),
    });
    expect(post.status).toBe(200);
    const { item } = (await post.json()) as {
      item: { id: string; internalNotes: string | null };
    };
    expect(item.id).toBeTruthy();

    const patch = await fetch(
      `${baseUrl()}/api/admin/mug-products/${item.id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: superCookie,
        },
        body: JSON.stringify({ internalNotes: "it-catalog-note" }),
      },
    );
    expect(patch.status).toBe(200);
    const patched = (await patch.json()) as {
      item: { internalNotes: string | null };
    };
    expect(patched.item.internalNotes).toBe("it-catalog-note");

    const dup = await fetch(
      `${baseUrl()}/api/admin/mug-products/${item.id}/duplicate`,
      {
        method: "POST",
        headers: { Cookie: superCookie },
      },
    );
    expect(dup.status).toBe(200);
    const dupBody = (await dup.json()) as { item: { id: string; sku: string } };
    expect(dupBody.item.id).not.toBe(item.id);
    expect(dupBody.item.sku).not.toBe(sku);

    await cleanupMug(dupBody.item.id);
    await cleanupMug(item.id);
  });

  it("notebook: POST, PATCH, duplicate", async () => {
    const sku = `IT-NCAT-${Date.now()}-${nanoid(4)}`.toUpperCase();
    const post = await fetch(`${baseUrl()}/api/admin/notebook-products`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: superCookie,
      },
      body: JSON.stringify({
        sku,
        nameRo: "N",
        nameRu: "N",
        nameEn: "N",
      }),
    });
    expect(post.status).toBe(200);
    const { item } = (await post.json()) as { item: { id: string } };

    const patch = await fetch(
      `${baseUrl()}/api/admin/notebook-products/${item.id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: superCookie,
        },
        body: JSON.stringify({ internalNotes: "nb-note" }),
      },
    );
    expect(patch.status).toBe(200);

    const dup = await fetch(
      `${baseUrl()}/api/admin/notebook-products/${item.id}/duplicate`,
      {
        method: "POST",
        headers: { Cookie: superCookie },
      },
    );
    expect(dup.status).toBe(200);
    const dupJ = (await dup.json()) as { item: { id: string } };

    await cleanupNotebook(dupJ.item.id);
    await cleanupNotebook(item.id);
  });

  it("GET /api/admin/notebook-products/:id/stock-movements — workshop 200, studio admin 403", async () => {
    const sku = `IT-NMOV-${Date.now()}-${nanoid(4)}`.toUpperCase();
    const nb = await prisma.notebookProduct.create({
      data: {
        sku,
        nameRo: "M",
        nameRu: "M",
        nameEn: "M",
        stockQuantity: 1,
        isActive: true,
      },
    });

    const ok = await fetch(
      `${baseUrl()}/api/admin/notebook-products/${nb.id}/stock-movements`,
      { headers: { Cookie: workshopCookie } },
    );
    expect(ok.status).toBe(200);
    const data = (await ok.json()) as { movements: unknown[] };
    expect(Array.isArray(data.movements)).toBe(true);

    const forbidden = await fetch(
      `${baseUrl()}/api/admin/notebook-products/${nb.id}/stock-movements`,
      { headers: { Cookie: adminCookie } },
    );
    expect(forbidden.status).toBe(403);

    await cleanupNotebook(nb.id);
  });
});
