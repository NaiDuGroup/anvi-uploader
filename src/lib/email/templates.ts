import type { ShopLang } from "@/lib/storefront/i18n";

/**
 * Storefront customer e-mails (ro / ru / en): simple branded HTML (logo,
 * navy #14213d, gold accent) + a plain-text version. Pure (unit-tested).
 * Every string table is `Record<ShopLang, …>`, so a missing language fails `tsc`.
 */

export type ShopEmailTemplate = "login" | "order_received" | "order_paid" | "order_shipped" | "ready_pickup";

export interface ShopEmailData {
  /** Absolute storefront origin, e.g. https://anvi.md (logo + footer link). */
  origin: string;
  name?: string | null;
  orderNumber?: number | string;
  total?: string;
  /** Order page (status, «Plătește acum»). */
  orderUrl?: string;
  /** One-time login link (signs in + verifies the e-mail). */
  loginUrl?: string;
  /** 6-digit code (login e-mail). */
  code?: string;
  trackingNumber?: string | null;
  pickupAddress?: string | null;
  /** Minutes the login link / code stays valid. */
  ttlMinutes?: number;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

type L = Record<ShopLang, string>;

const S = {
  hello: { ro: "Bună, {name}!", ru: "Здравствуйте, {name}!", en: "Hello, {name}!" },
  helloAnon: { ro: "Bună ziua!", ru: "Здравствуйте!", en: "Hello!" },
  loginSubject: { ro: "Codul de intrare ANVI: {code}", ru: "Код для входа в ANVI: {code}", en: "Your ANVI sign-in code: {code}" },
  loginText: {
    ro: "Ai cerut să intri în contul tău ANVI. Apasă butonul sau introdu codul pe site.",
    ru: "Вы запросили вход в аккаунт ANVI. Нажмите кнопку или введите код на сайте.",
    en: "You asked to sign in to your ANVI account. Press the button or enter the code on the site.",
  },
  loginButton: { ro: "Intră în cont", ru: "Войти в аккаунт", en: "Sign in" },
  codeLabel: { ro: "Cod", ru: "Код", en: "Code" },
  validFor: {
    ro: "Linkul și codul sunt valabile {n} minute și pot fi folosite o singură dată.",
    ru: "Ссылка и код действуют {n} минут и только один раз.",
    en: "The link and the code are valid for {n} minutes and can be used once.",
  },
  notYou: {
    ro: "Dacă nu ai cerut tu acest e-mail, ignoră-l — nimeni nu poate intra fără el.",
    ru: "Если вы не запрашивали это письмо, просто проигнорируйте его — без него войти нельзя.",
    en: "If you didn't ask for this e-mail, just ignore it — nobody can sign in without it.",
  },
  receivedSubject: {
    ro: "Comanda nr. {number} a fost primită",
    ru: "Заказ № {number} принят",
    en: "Order no. {number} received",
  },
  receivedText: {
    ro: "Am primit comanda nr. {number} în valoare de {total}. O începem imediat ce este achitată.",
    ru: "Мы получили заказ № {number} на сумму {total}. Начнём работу сразу после оплаты.",
    en: "We've received order no. {number} for {total}. We'll start as soon as it's paid.",
  },
  payButton: { ro: "Plătește", ru: "Оплатить", en: "Pay" },
  accountText: {
    ro: "Toate comenzile și fișierele tale sunt în contul ANVI. Linkul de mai jos te autentifică direct (valabil 3 zile, o singură dată):",
    ru: "Все ваши заказы и файлы — в аккаунте ANVI. Ссылка ниже сразу выполнит вход (действует 3 дня, один раз):",
    en: "All your orders and files are in your ANVI account. The link below signs you in directly (valid 3 days, once):",
  },
  accountButton: { ro: "Contul meu", ru: "Мой аккаунт", en: "My account" },
  paidSubject: {
    ro: "Comanda nr. {number} este achitată",
    ru: "Заказ № {number} оплачен",
    en: "Order no. {number} is paid",
  },
  paidText: {
    ro: "Mulțumim! Plata de {total} pentru comanda nr. {number} a fost confirmată. Începem lucrul.",
    ru: "Спасибо! Оплата {total} за заказ № {number} подтверждена. Начинаем работу.",
    en: "Thank you! The payment of {total} for order no. {number} is confirmed. We're starting work.",
  },
  orderButton: { ro: "Vezi comanda", ru: "Открыть заказ", en: "View order" },
  shippedSubject: {
    ro: "Comanda nr. {number} a fost expediată",
    ru: "Заказ № {number} отправлен",
    en: "Order no. {number} has shipped",
  },
  shippedText: {
    ro: "Comanda nr. {number} a fost predată curierului EVS.",
    ru: "Заказ № {number} передан курьерской службе EVS.",
    en: "Order no. {number} has been handed to the EVS courier.",
  },
  trackingLine: { ro: "Număr de urmărire EVS: {n}", ru: "Номер отслеживания EVS: {n}", en: "EVS tracking number: {n}" },
  trackingLater: {
    ro: "Numărul de urmărire va apărea pe pagina comenzii.",
    ru: "Номер отслеживания появится на странице заказа.",
    en: "The tracking number will appear on the order page.",
  },
  readySubject: {
    ro: "Comanda nr. {number} te așteaptă la atelier",
    ru: "Заказ № {number} готов к выдаче",
    en: "Order no. {number} is ready for pickup",
  },
  readyText: {
    ro: "Comanda nr. {number} este gata. O poți ridica din atelier.",
    ru: "Заказ № {number} готов. Его можно забрать в мастерской.",
    en: "Order no. {number} is ready. You can pick it up at the workshop.",
  },
  pickupLine: { ro: "Adresa: {address}", ru: "Адрес: {address}", en: "Address: {address}" },
  footer: {
    ro: "ANVI-STUDIO GROUP SRL · Chișinău · produse personalizate",
    ru: "ANVI-STUDIO GROUP SRL · Кишинёв · персонализированные изделия",
    en: "ANVI-STUDIO GROUP SRL · Chișinău · personalised products",
  },
  autoNote: {
    ro: "E-mail trimis automat — pentru întrebări răspunde la acest mesaj sau scrie-ne pe site.",
    ru: "Письмо отправлено автоматически — с вопросами ответьте на него или напишите нам на сайте.",
    en: "Automatic e-mail — reply to it or write to us on the site if you have questions.",
  },
} satisfies Record<string, L>;

function fill(tpl: string, vars: Record<string, string | number | undefined | null>): string {
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] != null ? String(vars[k]) : m));
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type Block =
  | { kind: "p"; text: string; muted?: boolean }
  | { kind: "button"; label: string; url: string; gold?: boolean }
  | { kind: "code"; label: string; code: string };

const NAVY = "#14213d";
const GOLD = "#cdac21";

function htmlBlock(b: Block): string {
  switch (b.kind) {
    case "p":
      return `<p style="margin:0 0 16px;font-size:${b.muted ? "13px" : "16px"};line-height:1.5;color:${b.muted ? "#6b7280" : NAVY}">${escapeHtml(b.text)}</p>`;
    case "button":
      return `<p style="margin:8px 0 20px"><a href="${escapeHtml(b.url)}" style="display:inline-block;padding:14px 26px;border-radius:10px;background:${b.gold ? GOLD : NAVY};color:${b.gold ? NAVY : "#ffffff"};font-weight:700;font-size:16px;text-decoration:none">${escapeHtml(b.label)}</a></p>`;
    case "code":
      return `<p style="margin:0 0 6px;font-size:13px;color:#6b7280">${escapeHtml(b.label)}</p><p style="margin:0 0 20px;font-size:32px;font-weight:800;letter-spacing:6px;color:${NAVY}">${escapeHtml(b.code)}</p>`;
  }
}

function textBlock(b: Block): string {
  switch (b.kind) {
    case "p":
      return b.text;
    case "button":
      return `${b.label}: ${b.url}`;
    case "code":
      return `${b.label}: ${b.code}`;
  }
}

function layout(lang: ShopLang, origin: string, title: string, blocks: Block[]): { html: string; text: string } {
  const o = origin.replace(/\/$/, "");
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:${NAVY};padding:18px 24px;border-bottom:4px solid ${GOLD}"><a href="${escapeHtml(o)}" style="text-decoration:none;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:2px"><img src="${escapeHtml(o)}/logo.png" width="36" height="36" alt="" style="vertical-align:middle;border:0;margin-right:10px">ANVI</a></td></tr>
<tr><td style="padding:28px 24px 12px">
<h1 style="margin:0 0 18px;font-size:22px;line-height:1.3;color:${NAVY}">${escapeHtml(title)}</h1>
${blocks.map(htmlBlock).join("\n")}
</td></tr>
<tr><td style="padding:16px 24px 24px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280">${escapeHtml(S.autoNote[lang])}<br>${escapeHtml(S.footer[lang])} · <a href="${escapeHtml(o)}" style="color:${NAVY}">${escapeHtml(o.replace(/^https?:\/\//, ""))}</a></td></tr>
</table></td></tr></table></body></html>`;
  const text = [title, "", ...blocks.map(textBlock).flatMap((t) => [t, ""]), "—", S.autoNote[lang], S.footer[lang], o].join("\n");
  return { html, text };
}

/** Subject + HTML + text of one customer e-mail. */
export function renderShopEmail(template: ShopEmailTemplate, lang: ShopLang, d: ShopEmailData): RenderedEmail {
  const v = { name: d.name?.trim().split(/\s+/)[0], number: d.orderNumber, total: d.total, code: d.code, n: d.ttlMinutes };
  const hello: Block = { kind: "p", text: v.name ? fill(S.hello[lang], v) : S.helloAnon[lang] };
  const t = (k: keyof typeof S) => fill(S[k][lang], v);
  const blocks: Block[] = [];
  let subject: string;
  let title: string;
  switch (template) {
    case "login":
      subject = t("loginSubject");
      title = S.loginButton[lang];
      blocks.push({ kind: "p", text: t("loginText") });
      if (d.loginUrl) blocks.push({ kind: "button", label: S.loginButton[lang], url: d.loginUrl });
      if (d.code) blocks.push({ kind: "code", label: S.codeLabel[lang], code: d.code });
      blocks.push({ kind: "p", text: t("validFor"), muted: true }, { kind: "p", text: t("notYou"), muted: true });
      break;
    case "order_received":
      subject = t("receivedSubject");
      title = subject;
      blocks.push(hello, { kind: "p", text: t("receivedText") });
      if (d.orderUrl) blocks.push({ kind: "button", label: S.payButton[lang], url: d.orderUrl, gold: true });
      if (d.loginUrl) {
        blocks.push({ kind: "p", text: t("accountText") }, { kind: "button", label: S.accountButton[lang], url: d.loginUrl });
      }
      break;
    case "order_paid":
      subject = t("paidSubject");
      title = subject;
      blocks.push(hello, { kind: "p", text: t("paidText") });
      if (d.orderUrl) blocks.push({ kind: "button", label: S.orderButton[lang], url: d.orderUrl });
      break;
    case "order_shipped":
      subject = t("shippedSubject");
      title = subject;
      blocks.push(hello, { kind: "p", text: t("shippedText") });
      blocks.push({ kind: "p", text: d.trackingNumber ? fill(S.trackingLine[lang], { n: d.trackingNumber }) : S.trackingLater[lang] });
      if (d.orderUrl) blocks.push({ kind: "button", label: S.orderButton[lang], url: d.orderUrl });
      break;
    case "ready_pickup":
      subject = t("readySubject");
      title = subject;
      blocks.push(hello, { kind: "p", text: t("readyText") });
      if (d.pickupAddress) blocks.push({ kind: "p", text: fill(S.pickupLine[lang], { address: d.pickupAddress }) });
      if (d.orderUrl) blocks.push({ kind: "button", label: S.orderButton[lang], url: d.orderUrl });
      break;
  }
  return { subject, ...layout(lang, d.origin, title, blocks) };
}
