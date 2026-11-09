import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const db = vi.hoisted(() => ({
  order: { findUnique: vi.fn() },
  corporateRequest: { findUnique: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
const views = vi.hoisted(() => ({
  loadShopOrderView: vi.fn(),
  shopLineDescriber: vi.fn(() => undefined),
}));
vi.mock("@/lib/shop/orders", () => views);
vi.mock("@/lib/storefront/lineLabelsServer", () => ({ loadShopLineLabels: vi.fn(async () => null) }));
const tg = vi.hoisted(() => ({ sendTelegram: vi.fn(async () => ({ status: "logged" })) }));
vi.mock("./telegram", async (importOriginal) => ({ ...(await importOriginal<typeof import("./telegram")>()), ...tg }));

import { adminPublicOrigin, alertCorporateRequest, alertShopOrderCreated, alertShopOrderPaid } from "./staffAlerts";

const ORDER = {
  id: "o1",
  source: "shop",
  deletedAt: null,
  publicToken: "tok",
  orderNumber: 501,
  phone: "069000000",
  customerName: "Ana",
  deliveryCity: null,
};
const VIEW = {
  total: 300,
  delivery: { method: "pickup" },
  lines: [{ title: "Кружка белая", optionsText: "330 мл", quantity: 3, total: 300 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  db.order.findUnique.mockResolvedValue(ORDER);
  views.loadShopOrderView.mockResolvedValue(VIEW);
});

describe("shop order alerts", () => {
  it("paid: one Russian message with the admin link", async () => {
    await alertShopOrderPaid("tok");
    expect(db.order.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { publicToken: "tok" } }));
    expect(tg.sendTelegram).toHaveBeenCalledTimes(1);
    const text = (tg.sendTelegram.mock.calls[0] as unknown as [string])[0];
    expect(text).toContain("Оплачен заказ с сайта № 501");
    expect(text).toContain("• Кружка белая (330 мл) × 3");
    expect(text).toContain("https://print.anvi.md/admin/orders/o1");
  });

  it("paid with a promo code: the code and the discount from the order", async () => {
    db.order.findUnique.mockResolvedValue({ ...ORDER, promoCode: "LANSARE10", promoDiscountMdl: { toString: () => "30" } });
    await alertShopOrderPaid("tok");
    expect(db.order.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ select: expect.objectContaining({ promoCode: true, promoDiscountMdl: true }) }),
    );
    const text = (tg.sendTelegram.mock.calls[0] as unknown as [string])[0];
    expect(text).toContain("Промокод: <b>LANSARE10</b>, скидка −30 лей");
  });

  it("studio, trashed or unknown orders send nothing", async () => {
    for (const o of [{ ...ORDER, source: "studio" }, { ...ORDER, deletedAt: new Date() }, null]) {
      db.order.findUnique.mockResolvedValue(o);
      await alertShopOrderPaid("tok");
    }
    expect(tg.sendTelegram).not.toHaveBeenCalled();
  });

  it("never throws into the caller", async () => {
    db.order.findUnique.mockRejectedValue(new Error("db down"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(alertShopOrderPaid("tok")).resolves.toBeUndefined();
    await expect(alertShopOrderCreated("o1", { TELEGRAM_ALERT_UNPAID_ORDERS: "1" })).resolves.toBeUndefined();
    err.mockRestore();
  });

  it("unpaid alerts only behind the flag", async () => {
    await alertShopOrderCreated("o1", {});
    expect(tg.sendTelegram).not.toHaveBeenCalled();
    await alertShopOrderCreated("o1", { TELEGRAM_ALERT_UNPAID_ORDERS: "1" });
    expect((tg.sendTelegram.mock.calls[0] as unknown as [string])[0]).toContain("ещё не оплачен");
  });

  it("pay-on-delivery orders always alert (they go straight to work)", async () => {
    db.order.findUnique.mockResolvedValue({ ...ORDER, paymentProvider: "on_delivery" });
    await alertShopOrderCreated("o1", {});
    const text = (tg.sendTelegram.mock.calls[0] as unknown as [string])[0];
    expect(text).toContain("оплата при получении");
    expect(text).not.toContain("ещё не оплачен");
  });

  it("admin origin can be overridden", () => {
    expect(adminPublicOrigin({})).toBe("https://print.anvi.md");
    expect(adminPublicOrigin({ ADMIN_PUBLIC_BASE_URL: "http://localhost:3000/" })).toBe("http://localhost:3000");
    expect(adminPublicOrigin({ ADMIN_PUBLIC_BASE_URL: "javascript:alert(1)" })).toBe("https://print.anvi.md");
  });
});

describe("corporate request alert", () => {
  it("labels products and quantity in Russian", async () => {
    db.corporateRequest.findUnique.mockResolvedValue({
      id: "r1",
      number: 3,
      companyName: "Orange",
      contactName: "Maria",
      phone: "069",
      email: "m@o.md",
      products: ["mugs", "other"],
      productsOther: "зонты",
      quantity: "500_1000",
      deadline: new Date("2026-12-01T00:00:00Z"),
      budget: "10 000 лей",
      hasLogo: false,
      files: [],
      message: null,
    });
    await alertCorporateRequest("r1");
    const text = (tg.sendTelegram.mock.calls[0] as unknown as [string])[0];
    expect(text).toContain("Заявка компании № 3");
    expect(text).toContain("Интересует: Кружки, Другое: зонты");
    expect(text).toContain("Тираж: 500–1000");
    expect(text).toContain("Срок: 01.12.2026");
    expect(text).toContain("Бюджет: 10 000 лей");
    expect(text).toContain("Логотип: нет");
    expect(text).toContain("/admin/shop/corporate-requests/r1");
  });
});
