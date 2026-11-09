import { describe, expect, it, vi } from "vitest";
import { SHOP_LANGS } from "@/lib/storefront/i18n";
import { sendEmail, type EmailLogRow } from "./send";
import { adminUpdateShopEvents } from "./shopEvents";
import { renderShopEmail, type ShopEmailTemplate } from "./templates";

const MAIL = { to: "a@b.md", subject: "S", html: "<p>h</p>", text: "Link: https://x/cont/verifica?token=SECRET", template: "login" };

function deps(env: Record<string, string | undefined>, fetchImpl?: typeof fetch) {
  const rows: EmailLogRow[] = [];
  const out = { info: vi.fn(), error: vi.fn() };
  return { rows, out, deps: { env, fetch: fetchImpl, console: out, log: async (r: EmailLogRow) => rows.push(r) } };
}

describe("sendEmail", () => {
  it("without RESEND_API_KEY / EMAIL_FROM: logs the e-mail, counts as sent, never throws", async () => {
    const d = deps({ NODE_ENV: "development" });
    const fetchSpy = vi.fn();
    const r = await sendEmail(MAIL, { ...d.deps, fetch: fetchSpy as unknown as typeof fetch });
    expect(r).toEqual({ provider: "console", status: "logged" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(d.out.info.mock.calls[0]![0]).toContain("token=SECRET");
    expect(d.rows[0]).toMatchObject({ to: "a@b.md", template: "login", provider: "console", status: "logged" });
    // The log row never holds the body (login links).
    expect(JSON.stringify(d.rows)).not.toContain("SECRET");
  });

  it("production without a provider: the console line has no body", async () => {
    const d = deps({ NODE_ENV: "production" });
    await sendEmail(MAIL, d.deps);
    expect(d.out.info.mock.calls[0]![0]).not.toContain("SECRET");
  });

  it("with a key: posts to the Resend API", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ id: "re_1" }), { status: 200 }));
    const d = deps({ RESEND_API_KEY: "re_key", EMAIL_FROM: "ANVI <comenzi@anvi.md>" }, f as unknown as typeof fetch);
    const r = await sendEmail(MAIL, d.deps);
    expect(r).toEqual({ provider: "resend", status: "sent", providerId: "re_1" });
    const [url, init] = f.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_key");
    expect(JSON.parse(init.body as string)).toMatchObject({ from: "ANVI <comenzi@anvi.md>", to: ["a@b.md"], subject: "S" });
  });

  it("a provider error or a network failure is logged as failed, not thrown", async () => {
    const bad = vi.fn(async () => new Response(JSON.stringify({ message: "domain not verified" }), { status: 403 }));
    const d1 = deps({ RESEND_API_KEY: "k", EMAIL_FROM: "a@anvi.md" }, bad as unknown as typeof fetch);
    expect(await sendEmail(MAIL, d1.deps)).toMatchObject({ status: "failed", error: "403 domain not verified" });
    const boom = vi.fn(async () => {
      throw new Error("offline");
    });
    const d2 = deps({ RESEND_API_KEY: "k", EMAIL_FROM: "a@anvi.md" }, boom as unknown as typeof fetch);
    expect(await sendEmail(MAIL, { ...d2.deps, log: async () => Promise.reject(new Error("db")) })).toMatchObject({ status: "failed" });
  });
});

describe("templates", () => {
  const TEMPLATES: ShopEmailTemplate[] = ["login", "order_received", "order_paid", "order_shipped", "ready_pickup"];
  const data = {
    origin: "https://anvi.md",
    name: "Ana <b>Popa</b>",
    orderNumber: 1234,
    total: "450 lei",
    orderUrl: "https://anvi.md/comanda/tok",
    loginUrl: "https://anvi.md/cont/verifica?token=abc",
    code: "123456",
    trackingNumber: "EVS123",
    pickupAddress: "str. Test 1",
    ttlMinutes: 15,
  };

  it("render in ro / ru / en with subject, HTML and text; no unfilled placeholders", () => {
    const subjects = new Set<string>();
    for (const tpl of TEMPLATES) {
      for (const lang of SHOP_LANGS) {
        const r = renderShopEmail(tpl, lang, data);
        subjects.add(r.subject);
        expect(r.subject.length).toBeGreaterThan(5);
        expect(r.html).toContain(`<html lang="${lang}">`);
        expect(r.html).toContain("#14213d");
        expect(r.html).toContain("https://anvi.md/logo.png");
        for (const s of [r.subject, r.html, r.text]) expect(s).not.toMatch(/\{\w+\}/);
        // User text is escaped.
        expect(r.html).not.toContain("<b>Popa</b>");
      }
    }
    expect(subjects.size).toBe(TEMPLATES.length * SHOP_LANGS.length);
  });

  it("carry the links, code, tracking number and address", () => {
    expect(renderShopEmail("login", "ro", data).text).toContain("123456");
    expect(renderShopEmail("login", "ru", data).text).toContain(data.loginUrl);
    const received = renderShopEmail("order_received", "en", data);
    expect(received.text).toContain(data.orderUrl);
    expect(received.text).toContain(data.loginUrl);
    expect(received.text).toContain("450 lei");
    expect(renderShopEmail("order_shipped", "ro", data).text).toContain("EVS123");
    expect(renderShopEmail("order_shipped", "ro", { ...data, trackingNumber: null }).text).not.toContain("EVS123");
    expect(renderShopEmail("ready_pickup", "ru", data).text).toContain("str. Test 1");
  });

  it("order received, pay on delivery: no «Pay» button, says how to pay", () => {
    const ro = renderShopEmail("order_received", "ro", { ...data, payOnDelivery: true });
    expect(ro.text).toContain("Plata se face la primire");
    expect(ro.text).toContain("Vezi comanda");
    expect(ro.text).not.toContain("Plătește");
    expect(renderShopEmail("order_received", "ru", { ...data, payOnDelivery: true }).text).toContain("Оплата при получении");
    expect(renderShopEmail("order_received", "ro", data).text).toContain("Plătește");
  });
});

describe("adminUpdateShopEvents", () => {
  const base = { source: "shop", status: "IN_PROGRESS", shippedAt: null, trackingNumber: null };
  it("«Отправлен» → shipped; tracking added later → shipped again (forced)", () => {
    expect(adminUpdateShopEvents(base, { ...base, shippedAt: new Date() })).toEqual([{ event: "shipped" }]);
    const shipped = { ...base, shippedAt: new Date() };
    expect(adminUpdateShopEvents(shipped, { ...shipped, trackingNumber: "EVS1" })).toEqual([{ event: "shipped", force: true }]);
    expect(adminUpdateShopEvents(base, { ...base, trackingNumber: "EVS1" })).toEqual([]);
  });
  it("READY_IN_STUDIO → ready; studio orders never", () => {
    expect(adminUpdateShopEvents(base, { ...base, status: "READY_IN_STUDIO" })).toEqual([{ event: "ready" }]);
    expect(adminUpdateShopEvents({ ...base, source: "studio" }, { ...base, status: "READY_IN_STUDIO" })).toEqual([]);
  });
});
