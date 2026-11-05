import { toCsv } from "@/lib/shop/report/period";
import type { FunnelStep, ShopFunnelReport } from "./funnel";

/** Step names in the CSV (Russian, the studio language). */
export const FUNNEL_STEP_RU: Record<FunnelStep, string> = {
  visit: "Визиты (просмотр страницы)",
  product_view: "Просмотр товара",
  add_to_cart: "Добавили в корзину",
  cart_view: "Открыли корзину",
  checkout_start: "Начали оформление",
  payment_start: "Перешли к оплате",
  paid: "Оплатили",
};

const DEVICE_RU: Record<string, string> = { mobile: "Телефон", desktop: "Компьютер" };

/** The funnel report as one CSV (sections separated by an empty row). */
export function shopFunnelCsv(r: ShopFunnelReport): string {
  const rows: (string | number | null)[][] = [];
  rows.push(["Воронка сайта", `${r.from} — ${r.to}`], []);
  rows.push(["Шаг", "Сессий", "% от предыдущего", "% от визитов", "Потеряно"]);
  for (const s of r.steps) rows.push([FUNNEL_STEP_RU[s.step], s.sessions, s.fromPrev, s.fromStart, s.dropped]);
  rows.push([]);
  rows.push(["Товар", "Slug", "Категория", "Просмотры", "В корзину", "Оформление", "Оплачено", "% в корзину", "Не добавили", "Добавили, но не оплатили"]);
  for (const p of r.products) {
    rows.push([p.name, p.product, p.category, p.views, p.adds, p.checkouts, p.paid, p.addRate, p.lostAtView, p.lostAfterAdd]);
  }
  rows.push([]);
  rows.push(["Источник", "utm_medium", "utm_campaign", "Сессий", "Доля %", "В корзину", "Оформление", "Оплачено", "Конверсия %"]);
  for (const s of r.sources) {
    rows.push([s.source ?? "прямые", s.medium, s.campaign, s.sessions, s.share, s.adds, s.checkouts, s.paid, s.conversion]);
  }
  rows.push([]);
  rows.push(["Устройство", "Сессий", "Доля %", "Оплачено", "Конверсия %"]);
  for (const d of r.devices) rows.push([d.device ? (DEVICE_RU[d.device] ?? d.device) : "не известно", d.sessions, d.share, d.paid, d.conversion]);
  return toCsv(rows);
}
