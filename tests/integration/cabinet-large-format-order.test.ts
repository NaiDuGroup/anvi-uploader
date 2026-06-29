/**
 * Cabinet (customer portal) large-format order creation via POST /api/orders.
 *
 * Covers: tier (retail/dealer) derived from the logged-in customer's session
 * (never the client body), preset price parity, roll-stock deduction, the
 * logged-in-only guard, and a direct parity check of `resolveLargeFormatLine`.
 *
 * Needs a running app + DB (TEST_BASE_URL / PLAYWRIGHT_BASE_URL).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { baseUrl } from "./helpers";
import { hashPassword } from "@/lib/auth";
import { normalizedPhoneForDb } from "@/lib/studioClient";
import { resolveLargeFormatLine } from "@/lib/adminOrderCreateHelpers";
import { DEFAULT_PRINT_PROCESS } from "@/lib/printProcess";

const shouldRun = Boolean(
  process.env.TEST_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL,
);

const CUSTOMER_SESSION_NAME = "customer_session";
const INK_TANK_ID = DEFAULT_PRINT_PROCESS;
const ACCOUNTING_ID = "default";
const CUSTOMER_PASSWORD = "cabinet-lf-pass-123";

function customerCookieFromResponse(res: Response): string | null {
  const list =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [];
  for (const c of list) {
    if (c.startsWith(`${CUSTOMER_SESSION_NAME}=`)) {
      return c.split(";")[0] ?? null;
    }
  }
  const raw = res.headers.get("set-cookie");
  if (raw) {
    for (const p of raw.split(/,(?=[^;]+?=)/)) {
      const trimmed = p.trim();
      if (trimmed.startsWith(`${CUSTOMER_SESSION_NAME}=`)) {
        return trimmed.split(";")[0] ?? null;
      }
    }
  }
  return null;
}

/** Creates a studio customer + linked portal account, returns ids + phone. */
async function createPortalCustomer(opts: { isDealer: boolean; tag: string }) {
  const phone = `+3730${Date.now().toString().slice(-7)}${
    opts.isDealer ? "1" : "0"
  }`;
  const phoneNormalized = normalizedPhoneForDb(phone)!;
  const customer = await prisma.studioCustomer.create({
    data: {
      kind: "individual",
      phone,
      phoneNormalized,
      personName: `Cabinet LF ${opts.tag}`,
      isDealer: opts.isDealer,
    },
  });
  const user = await prisma.user.create({
    data: {
      name: `cabinet-lf-${opts.tag}`,
      role: "customer",
      password: hashPassword(CUSTOMER_PASSWORD),
      phoneNormalized,
      studioCustomerId: customer.id,
    },
  });
  return { customerId: customer.id, userId: user.id, phone };
}

async function cabinetLogin(phone: string): Promise<string> {
  const res = await fetch(`${baseUrl()}/api/cabinet/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, password: CUSTOMER_PASSWORD }),
  });
  if (!res.ok) {
    throw new Error(`Cabinet login failed ${res.status}: ${await res.text()}`);
  }
  const cookie = customerCookieFromResponse(res);
  if (!cookie) throw new Error("No customer_session cookie in login response");
  return cookie;
}

async function createMaterialWithPreset(tag: string) {
  const material = await prisma.largeFormatMaterial.create({
    data: {
      name: `Cabinet LF mat ${tag}`,
      rollWidthMeters: new Prisma.Decimal("1.520"),
      printableWidthMeters: new Prisma.Decimal("1.220"),
      rollLengthMeters: new Prisma.Decimal("30.000"),
      stockLinearMeters: new Prisma.Decimal("50"),
      costPerLinearMeter: 40,
      dealerPricePerLinearMeter: 80,
      retailPricePerLinearMeter: 120,
      dealerPrintPricePerLinearMeter: 25,
      retailPrintPricePerLinearMeter: 45,
      finalRetailPricePerLinearMeter: 200,
      finalDealerPricePerLinearMeter: 120,
      // Pin the per-meter rate so custom-size pricing is deterministic
      // regardless of the studio's global markup multipliers.
      manualFinalRetailPricePerLinearMeter: 200,
      manualFinalDealerPricePerLinearMeter: 120,
      isActive: true,
      sortOrder: 0,
    },
  });
  const preset = await prisma.lfMaterialSizePreset.create({
    data: {
      materialId: material.id,
      widthCm: 30,
      heightCm: 42,
      retailPriceMdl: 390,
      dealerPriceMdl: 290,
      sortOrder: 0,
      isActive: true,
    },
  });
  return { material, preset };
}

describe.skipIf(!shouldRun)("integration: cabinet LF order create", () => {
  let savedProductionCosts: Prisma.JsonValue | null = null;
  let savedInk: { stockMl: Prisma.Decimal; avgCostPerMl: Prisma.Decimal } | null =
    null;
  const createdCustomerIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdMaterialIds: string[] = [];

  beforeAll(async () => {
    const acct = await prisma.accountingSettings.findUnique({
      where: { id: ACCOUNTING_ID },
    });
    savedProductionCosts = acct?.productionCosts ?? null;
    const inkRow = await prisma.inkInventory.findUnique({
      where: { id: INK_TANK_ID },
    });
    savedInk = inkRow
      ? { stockMl: inkRow.stockMl, avgCostPerMl: inkRow.avgCostPerMl }
      : null;

    const mergedCosts =
      acct?.productionCosts != null &&
      typeof acct.productionCosts === "object" &&
      !Array.isArray(acct.productionCosts)
        ? { ...(acct.productionCosts as Record<string, unknown>) }
        : {};

    await prisma.accountingSettings.upsert({
      where: { id: ACCOUNTING_ID },
      create: {
        id: ACCOUNTING_ID,
        productionCosts: {
          ...mergedCosts,
          inkMlPerSqmLargeFormatRoll: 20,
          lfMinimumLineTotalMdl: 0,
        },
      },
      update: {
        productionCosts: {
          ...mergedCosts,
          inkMlPerSqmLargeFormatRoll: 20,
          lfMinimumLineTotalMdl: 0,
        },
      },
    });

    await prisma.inkInventory.upsert({
      where: { id: INK_TANK_ID },
      create: {
        id: INK_TANK_ID,
        stockMl: new Prisma.Decimal("50000"),
        avgCostPerMl: new Prisma.Decimal("0.5"),
      },
      update: {
        stockMl: new Prisma.Decimal("50000"),
        avgCostPerMl: new Prisma.Decimal("0.5"),
      },
    });
  });

  afterAll(async () => {
    for (const id of createdMaterialIds) {
      await prisma.lfMaterialSizePreset.deleteMany({ where: { materialId: id } });
      await prisma.largeFormatMaterial.delete({ where: { id } }).catch(() => {});
    }
    for (const id of createdUserIds) {
      await prisma.session.deleteMany({ where: { userId: id } });
      await prisma.user.delete({ where: { id } }).catch(() => {});
    }
    for (const id of createdCustomerIds) {
      await prisma.studioCustomer.delete({ where: { id } }).catch(() => {});
    }

    await prisma.accountingSettings.update({
      where: { id: ACCOUNTING_ID },
      data: {
        productionCosts:
          savedProductionCosts === null || savedProductionCosts === undefined
            ? {}
            : savedProductionCosts,
      },
    });
    if (savedInk) {
      await prisma.inkInventory.update({
        where: { id: INK_TANK_ID },
        data: { stockMl: savedInk.stockMl, avgCostPerMl: savedInk.avgCostPerMl },
      });
    }
    await prisma.$disconnect();
  });

  it("retail customer: preset price (no client customerType) + roll deduction", async () => {
    const who = await createPortalCustomer({ isDealer: false, tag: `r${Date.now()}` });
    createdCustomerIds.push(who.customerId);
    createdUserIds.push(who.userId);
    const { material, preset } = await createMaterialWithPreset(`r${Date.now()}`);
    createdMaterialIds.push(material.id);

    const cookie = await cabinetLogin(who.phone);
    const stockBefore = Number(
      (await prisma.largeFormatMaterial.findUniqueOrThrow({ where: { id: material.id } }))
        .stockLinearMeters,
    );

    const res = await fetch(`${baseUrl()}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        productType: "large_format_print",
        largeFormatMaterialId: material.id,
        lfSizePresetId: preset.id,
        printWidthCm: 30,
        printHeightCm: 42,
        quantity: 2,
        files: [
          {
            fileName: "wide.pdf",
            fileUrl: "uploads/cabinet-lf-retail",
            copies: 2,
            color: "color",
            paperType: "large_format",
          },
        ],
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      id: string;
      price: number | string | null;
      needsProcurement?: boolean;
      orderLines: Array<{
        productType: string;
        largeFormatMaterialId: string | null;
        largeFormatLineData: {
          totalSellPrice: number;
          customerType: string;
          calculatedLinearMeters: number;
        };
      }>;
    };

    const line = body.orderLines[0]!;
    expect(line.productType).toBe("large_format_print");
    expect(line.largeFormatMaterialId).toBe(material.id);
    // Tier comes from the session, not the (omitted) request body.
    expect(line.largeFormatLineData.customerType).toBe("retail");
    // 390 retail × 2 = 780, preset locks the total (no ink markup / min uplift).
    expect(line.largeFormatLineData.totalSellPrice).toBe(780);
    expect(Number(body.price)).toBe(780);
    expect(body.needsProcurement).not.toBe(true);

    const stockAfter = Number(
      (await prisma.largeFormatMaterial.findUniqueOrThrow({ where: { id: material.id } }))
        .stockLinearMeters,
    );
    expect(stockBefore - stockAfter).toBeCloseTo(
      line.largeFormatLineData.calculatedLinearMeters,
      5,
    );

    await prisma.order.delete({ where: { id: body.id } });
  });

  it("dealer customer: dealer preset price derived from session", async () => {
    const who = await createPortalCustomer({ isDealer: true, tag: `d${Date.now()}` });
    createdCustomerIds.push(who.customerId);
    createdUserIds.push(who.userId);
    const { material, preset } = await createMaterialWithPreset(`d${Date.now()}`);
    createdMaterialIds.push(material.id);

    const cookie = await cabinetLogin(who.phone);

    const res = await fetch(`${baseUrl()}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        productType: "large_format_print",
        largeFormatMaterialId: material.id,
        lfSizePresetId: preset.id,
        printWidthCm: 30,
        printHeightCm: 42,
        quantity: 2,
        files: [
          {
            fileName: "wide.pdf",
            fileUrl: "uploads/cabinet-lf-dealer",
            copies: 2,
            color: "color",
            paperType: "large_format",
          },
        ],
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      id: string;
      price: number | string | null;
      orderLines: Array<{
        largeFormatLineData: { totalSellPrice: number; customerType: string };
      }>;
    };
    const line = body.orderLines[0]!;
    expect(line.largeFormatLineData.customerType).toBe("dealer");
    // 290 dealer × 2 = 580.
    expect(line.largeFormatLineData.totalSellPrice).toBe(580);
    expect(Number(body.price)).toBe(580);

    await prisma.order.delete({ where: { id: body.id } });
  });

  it("rejects large-format orders without a customer session", async () => {
    const { material, preset } = await createMaterialWithPreset(`anon${Date.now()}`);
    createdMaterialIds.push(material.id);

    const res = await fetch(`${baseUrl()}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: "+37300000000",
        productType: "large_format_print",
        largeFormatMaterialId: material.id,
        lfSizePresetId: preset.id,
        printWidthCm: 30,
        printHeightCm: 42,
        quantity: 1,
        files: [
          {
            fileName: "wide.pdf",
            fileUrl: "uploads/cabinet-lf-anon",
            copies: 1,
            color: "color",
            paperType: "large_format",
          },
        ],
      }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("large_format_requires_login");
  });

  it("resolveLargeFormatLine: preset locks total, custom uses per-meter rate", async () => {
    const { material, preset } = await createMaterialWithPreset(`unit${Date.now()}`);
    createdMaterialIds.push(material.id);

    const withPreset = await resolveLargeFormatLine({
      largeFormatMaterialId: material.id,
      printWidthCm: 30,
      printHeightCm: 42,
      quantity: 2,
      customerType: "retail",
      lfSizePresetId: preset.id,
    });
    expect(withPreset.totalSellPriceMdl).toBe(780);
    expect(withPreset.largeFormatLineData.customerType).toBe("retail");

    const dealerPreset = await resolveLargeFormatLine({
      largeFormatMaterialId: material.id,
      printWidthCm: 30,
      printHeightCm: 42,
      quantity: 2,
      customerType: "dealer",
      lfSizePresetId: preset.id,
    });
    expect(dealerPreset.totalSellPriceMdl).toBe(580);

    // Without a preset the price is driven by the per-meter rate (+ ink), so it
    // must be strictly positive and at least material rate × linear meters.
    const custom = await resolveLargeFormatLine({
      largeFormatMaterialId: material.id,
      printWidthCm: 100,
      printHeightCm: 50,
      quantity: 1,
      customerType: "retail",
      lfSizePresetId: null,
    });
    expect(custom.totalSellPriceMdl).toBeGreaterThan(0);
    expect(custom.calculatedLinearMeters).toBeGreaterThan(0);
    expect(custom.totalSellPriceMdl).toBeGreaterThanOrEqual(
      Math.round(200 * custom.calculatedLinearMeters),
    );
  });
});
