import { describe, expect, it, vi } from "vitest";
import {
  escapeTelegramHtml,
  formatCorporateRequest,
  formatMdlRu,
  formatShopOrderCreated,
  formatShopOrderPaid,
  formatTelegramTest,
  sendTelegram,
  telegramConfigured,
  telegramStatus,
  telegramUnpaidOrdersEnabled,
  TELEGRAM_MAX_LENGTH,
} from "./telegram";

const order = {
  orderNumber: 1042,
  total: 1234.5,
  deliveryMethod: "courier_moldova",
  deliveryCity: "Bălți",
  customerName: "Ana <b>",
  phone: "069123456",
  lines: [
    { title: "Cană albă", optionsText: "330 ml", quantity: 2 },
    { title: "Printare foto", optionsText: "10×15, 20 buc.", quantity: 20, noQty: true },
  ],
  adminUrl: "https://print.anvi.md/admin/orders/abc",
};

const ENV = { TELEGRAM_BOT_TOKEN: "123:ABC", TELEGRAM_STAFF_CHAT_ID: "-100500" };
const quiet = { info: vi.fn(), error: vi.fn() };

describe("formatting", () => {
  it("paid order: number, total, delivery, items, admin link", () => {
    const m = formatShopOrderPaid(order);
    expect(m).toContain("💰 <b>Оплачен заказ с сайта № 1042</b>");
    expect(m).toContain("Сумма: <b>1 234,5 лей</b>");
    expect(m).toContain("Доставка: Курьер по Молдове (EVS), Bălți");
    expect(m).toContain("• Cană albă (330 ml) × 2");
    expect(m).toContain("• Printare foto (10×15, 20 buc.)\n");
    expect(m).toContain('<a href="https://print.anvi.md/admin/orders/abc">Открыть в админке</a>');
    // User text is escaped.
    expect(m).toContain("Клиент: Ana &lt;b&gt;, 069123456");
  });

  it("paid order with a promo code: the code and the discount", () => {
    const m = formatShopOrderPaid({ ...order, promoCode: "LANSARE10", promoDiscount: 137.5 });
    expect(m).toContain("Сумма: <b>1 234,5 лей</b>\nПромокод: <b>LANSARE10</b>, скидка −137,5 лей\n");
    // No discount amount (e.g. a free-delivery code at 0): the code alone; no code: no line.
    expect(formatShopOrderPaid({ ...order, promoCode: "FREE", promoDiscount: 0 })).toContain("Промокод: <b>FREE</b>\n");
    expect(formatShopOrderPaid(order)).not.toContain("Промокод");
    expect(formatShopOrderPaid({ ...order, promoCode: "<x>" })).toContain("Промокод: <b>&lt;x&gt;</b>");
  });

  it("pickup has no city; unpaid has its own title", () => {
    const m = formatShopOrderCreated({ ...order, deliveryMethod: "pickup" });
    expect(m).toContain("🛒 <b>Новый заказ с сайта № 1042</b> (ещё не оплачен)");
    expect(m).toContain("Доставка: Самовывоз из мастерской\n");
  });

  it("long carts are cut to 10 lines", () => {
    const lines = Array.from({ length: 13 }, (_, i) => ({ title: `P${i}`, quantity: 1 }));
    const m = formatShopOrderPaid({ ...order, lines });
    expect(m).toContain("• P9 × 1");
    expect(m).not.toContain("• P10");
    expect(m).toContain("…и ещё 3");
  });

  it("corporate request", () => {
    const m = formatCorporateRequest({
      number: 7,
      companyName: "A & B SRL",
      contactName: "Ion",
      phone: "+373 69 000 000",
      email: "ion@ab.md",
      products: ["Кружки", "Другое: зонты"],
      quantity: "100–250",
      deadline: "20.11.2026",
      budget: " ",
      hasLogo: true,
      fileCount: 2,
      message: "<script>",
      adminUrl: "https://print.anvi.md/admin/corporate-requests/x",
    });
    expect(m).toContain("🏢 <b>Заявка компании № 7</b>");
    expect(m).toContain("Компания: <b>A &amp; B SRL</b>");
    expect(m).toContain("Интересует: Кружки, Другое: зонты");
    expect(m).toContain("Логотип: есть · файлов: 2");
    expect(m).not.toContain("Бюджет");
    expect(m).toContain("&lt;script&gt;");
    expect(m).toContain("Открыть заявку");
  });

  it("helpers", () => {
    expect(escapeTelegramHtml(`a<b>&"c"`)).toBe("a&lt;b&gt;&amp;&quot;c&quot;");
    expect(formatMdlRu(150)).toBe("150 лей");
    expect(formatTelegramTest("Anvi", new Date("2026-11-05T10:00:00Z"))).toContain("Отправил: Anvi");
  });
});

describe("config", () => {
  it("needs both variables", () => {
    expect(telegramConfigured(ENV)).toBe(true);
    expect(telegramConfigured({ TELEGRAM_BOT_TOKEN: "x" })).toBe(false);
    expect(telegramConfigured({ TELEGRAM_STAFF_CHAT_ID: " " , TELEGRAM_BOT_TOKEN: "x" })).toBe(false);
    expect(telegramConfigured({})).toBe(false);
  });

  it("status never exposes the token", () => {
    const s = telegramStatus(ENV);
    expect(s).toEqual({ configured: true, hasToken: true, chatId: "-100500", unpaidOrders: false });
    expect(JSON.stringify(s)).not.toContain("ABC");
  });

  it("unpaid-order alerts are off by default", () => {
    expect(telegramUnpaidOrdersEnabled({})).toBe(false);
    expect(telegramUnpaidOrdersEnabled({ TELEGRAM_ALERT_UNPAID_ORDERS: "0" })).toBe(false);
    expect(telegramUnpaidOrdersEnabled({ TELEGRAM_ALERT_UNPAID_ORDERS: "true" })).toBe(true);
    expect(telegramUnpaidOrdersEnabled({ TELEGRAM_ALERT_UNPAID_ORDERS: "1" })).toBe(true);
  });
});

describe("sendTelegram", () => {
  it("without config: only logs and counts as sent", async () => {
    const f = vi.fn();
    const out = { info: vi.fn(), error: vi.fn() };
    const r = await sendTelegram("<b>Hi</b>", { env: {}, fetch: f as unknown as typeof fetch, console: out });
    expect(r).toEqual({ status: "logged" });
    expect(f).not.toHaveBeenCalled();
    expect(out.info).toHaveBeenCalledWith(expect.stringContaining("Hi"));
  });

  it("posts HTML to the staff chat", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const r = await sendTelegram("<b>Hi</b>", { env: ENV, fetch: f as unknown as typeof fetch, console: quiet });
    expect(r).toEqual({ status: "sent" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.telegram.org/bot123:ABC/sendMessage");
    expect(JSON.parse(String(init.body))).toEqual({
      chat_id: "-100500",
      text: "<b>Hi</b>",
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
  });

  it("an API error or a network failure is reported, never thrown, and never logs the token", async () => {
    const out = { info: vi.fn(), error: vi.fn() };
    const bad = vi.fn(async () => new Response(JSON.stringify({ description: "chat not found" }), { status: 400 }));
    await expect(sendTelegram("x", { env: ENV, fetch: bad as unknown as typeof fetch, console: out })).resolves.toEqual({
      status: "failed",
      error: "400 chat not found",
    });
    const boom = vi.fn(async () => {
      throw new TypeError("fetch failed https://api.telegram.org/bot123:ABC/sendMessage");
    });
    const r = await sendTelegram("x", { env: ENV, fetch: boom as unknown as typeof fetch, console: out });
    expect(r.status).toBe("failed");
    expect(JSON.stringify(out.error.mock.calls)).not.toContain("123:ABC");
  });

  it("cuts messages over Telegram's limit", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 200 }));
    await sendTelegram("x".repeat(5000), { env: ENV, fetch: f as unknown as typeof fetch, console: quiet });
    const body = JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body)) as { text: string };
    expect(body.text.length).toBe(TELEGRAM_MAX_LENGTH + 1);
  });
});
