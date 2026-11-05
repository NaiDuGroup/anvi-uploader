import type { PromoRejectReason } from "@/lib/shop/promo/promoCore";
import type { Localized, ShopLang } from "./i18n";

/**
 * Storefront promo-code strings (checkout field, order summary, errors) in
 * ro / ru / en. Every entry is `Localized`, so a missing language fails `tsc`.
 */
export const PROMO_TEXT = {
  toggle: { ro: "Am un cod promoțional", ru: "У меня есть промокод", en: "I have a promo code" },
  label: { ro: "Cod promoțional", ru: "Промокод", en: "Promo code" },
  apply: { ro: "Aplică", ru: "Применить", en: "Apply" },
  applying: { ro: "Verificăm…", ru: "Проверяем…", en: "Checking…" },
  remove: { ro: "Elimină", ru: "Убрать", en: "Remove" },
  applied: { ro: "Codul {code} a fost aplicat", ru: "Промокод {code} применён", en: "Code {code} applied" },
  discountLine: { ro: "Reducere ({code})", ru: "Скидка ({code})", en: "Discount ({code})" },
  freeDelivery: { ro: "Livrare gratuită", ru: "Бесплатная доставка", en: "Free delivery" },
  errEmpty: { ro: "Introdu codul.", ru: "Введите промокод.", en: "Enter the code." },
  errRateLimit: {
    ro: "Prea multe încercări. Încearcă din nou peste câteva minute.",
    ru: "Слишком много попыток. Попробуйте через несколько минут.",
    en: "Too many attempts. Try again in a few minutes.",
  },
  errServer: {
    ro: "Nu am putut verifica codul. Încearcă din nou.",
    ru: "Не удалось проверить промокод. Попробуйте ещё раз.",
    en: "We couldn't check the code. Please try again.",
  },
  checkoutRejected: {
    ro: "Codul promoțional nu mai poate fi aplicat: {reason} Elimină-l sau încearcă altul.",
    ru: "Промокод больше не действует: {reason} Уберите его или введите другой.",
    en: "The promo code can no longer be applied: {reason} Remove it or try another one.",
  },
} satisfies Record<string, Localized>;

export const PROMO_REASON_TEXT: Record<PromoRejectReason, Localized> = {
  invalid: {
    ro: "Codul nu există sau nu mai este activ.",
    ru: "Такого промокода нет или он больше не действует.",
    en: "This code doesn't exist or is no longer active.",
  },
  not_started: { ro: "Codul nu este încă valabil.", ru: "Промокод ещё не начал действовать.", en: "This code isn't valid yet." },
  expired: { ro: "Codul a expirat.", ru: "Срок действия промокода истёк.", en: "This code has expired." },
  min_total: {
    ro: "Codul se aplică la comenzi de la {min} (produse eligibile).",
    ru: "Промокод действует для заказов от {min} (подходящие товары).",
    en: "This code applies to orders from {min} (eligible products).",
  },
  limit_reached: {
    ro: "Codul a fost deja folosit de numărul maxim de ori.",
    ru: "Промокод уже использован максимальное число раз.",
    en: "This code has reached its usage limit.",
  },
  customer_limit: {
    ro: "Ai folosit deja acest cod.",
    ru: "Вы уже использовали этот промокод.",
    en: "You have already used this code.",
  },
  email_required: {
    ro: "Introdu adresa de e-mail — codul este valabil o dată per client.",
    ru: "Укажите e-mail — промокод действует ограниченное число раз на покупателя.",
    en: "Enter your e-mail — this code is limited per customer.",
  },
  not_applicable: {
    ro: "Codul nu se aplică produselor din coș sau modului de livrare ales.",
    ru: "Промокод не действует для товаров в корзине или выбранного способа доставки.",
    en: "This code doesn't apply to the products in your cart or the chosen delivery.",
  },
};

function fill(s: string, vars?: Record<string, string>): string {
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m) : s;
}

export function promoText(key: keyof typeof PROMO_TEXT, lang: ShopLang, vars?: Record<string, string>): string {
  return fill(PROMO_TEXT[key][lang], vars);
}

export function promoReasonText(reason: string, lang: ShopLang, vars?: Record<string, string>): string {
  const r = (PROMO_REASON_TEXT as Record<string, Localized | undefined>)[reason] ?? PROMO_REASON_TEXT.invalid;
  return fill(r[lang], vars);
}
