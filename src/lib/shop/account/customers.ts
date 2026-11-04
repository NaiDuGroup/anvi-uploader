import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ShopLang } from "@/lib/storefront/i18n";
import {
  SHOP_LOGIN_MAX_ATTEMPTS,
  SHOP_LOGIN_TTL_MS,
  SHOP_ORDER_LINK_TTL_MS,
  hashLoginCode,
  hashLoginToken,
  loginTokenUsable,
  newLoginCode,
  newLoginToken,
  normalizeShopEmail,
  type ShopLoginPurpose,
} from "./tokens";

/**
 * Storefront customer accounts (`ShopCustomer`) and their one-time login
 * tokens. An account is found or created from the checkout e-mail; it is
 * only signed in through a link / code sent to that e-mail.
 */

export interface ShopSavedDelivery {
  method: "pickup" | "courier_chisinau" | "courier_moldova";
  city?: string;
  address?: string;
  note?: string;
}

export interface ShopCustomerSeed {
  name?: string | null;
  phone?: string | null;
  delivery?: ShopSavedDelivery | null;
  locale?: ShopLang | null;
}

/**
 * The account of `email` (case-insensitive), created when missing. Empty
 * name / phone / delivery are filled from `seed` (the first checkout), never
 * overwritten. Concurrent creates of the same e-mail resolve to one row.
 */
export async function findOrCreateShopCustomer(rawEmail: string, seed: ShopCustomerSeed = {}) {
  const email = normalizeShopEmail(rawEmail);
  if (!email) throw new Error("invalid_email");
  let c = await prisma.shopCustomer.findUnique({ where: { email } });
  if (!c) {
    try {
      c = await prisma.shopCustomer.create({
        data: {
          email,
          name: seed.name ?? null,
          phone: seed.phone ?? null,
          ...(seed.delivery ? { delivery: seed.delivery as unknown as Prisma.InputJsonValue } : {}),
          locale: seed.locale ?? null,
        },
      });
      return c;
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
      c = await prisma.shopCustomer.findUnique({ where: { email } });
      if (!c) throw e;
    }
  }
  const fill: Prisma.ShopCustomerUpdateInput = {};
  if (!c.name && seed.name) fill.name = seed.name;
  if (!c.phone && seed.phone) fill.phone = seed.phone;
  if (c.delivery == null && seed.delivery) fill.delivery = seed.delivery as unknown as Prisma.InputJsonValue;
  if (seed.locale && seed.locale !== c.locale) fill.locale = seed.locale;
  if (Object.keys(fill).length) c = await prisma.shopCustomer.update({ where: { id: c.id }, data: fill });
  return c;
}

export interface IssuedLogin {
  token: string;
  /** Only for `login` tokens. */
  code: string | null;
  expiresAt: Date;
}

/** Store a new login token (hashed) for `email`; returns the plain token / code to e-mail. */
export async function issueShopLoginToken(
  rawEmail: string,
  secret: string,
  opts: { purpose?: ShopLoginPurpose; customerId?: string | null; ip?: string | null; userAgent?: string | null; now?: number } = {},
): Promise<IssuedLogin> {
  const email = normalizeShopEmail(rawEmail);
  if (!email) throw new Error("invalid_email");
  const purpose: ShopLoginPurpose = opts.purpose ?? "login";
  const now = opts.now ?? Date.now();
  const token = newLoginToken();
  const code = purpose === "login" ? newLoginCode() : null;
  const expiresAt = new Date(now + (purpose === "login" ? SHOP_LOGIN_TTL_MS : SHOP_ORDER_LINK_TTL_MS));
  await prisma.shopLoginToken.create({
    data: {
      tokenHash: hashLoginToken(token),
      codeHash: code ? hashLoginCode(secret, email, code) : null,
      email,
      customerId: opts.customerId ?? null,
      purpose,
      expiresAt,
      ip: opts.ip?.slice(0, 64) ?? null,
      userAgent: opts.userAgent?.slice(0, 300) ?? null,
    },
  });
  return { token, code, expiresAt };
}

/** Mark a token used (only if still unused) and sign the account in; null when it lost the race. */
async function finishLogin(tokenId: string, email: string, locale?: ShopLang | null) {
  const now = new Date();
  const res = await prisma.shopLoginToken.updateMany({ where: { id: tokenId, usedAt: null }, data: { usedAt: now } });
  if (res.count !== 1) return null;
  const c = await findOrCreateShopCustomer(email, { locale: locale ?? null });
  return prisma.shopCustomer.update({
    where: { id: c.id },
    data: { lastLoginAt: now, ...(c.emailVerifiedAt ? {} : { emailVerifiedAt: now }) },
  });
}

/** Trade a link token for its account (single use, unexpired); null otherwise. */
export async function consumeShopLoginToken(token: unknown, now: number = Date.now()) {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return null;
  const row = await prisma.shopLoginToken.findUnique({ where: { tokenHash: hashLoginToken(token) } });
  if (!row || !loginTokenUsable(row, now)) return null;
  return finishLogin(row.id, row.email);
}

/**
 * Trade an e-mail + 6-digit code for the account. Only the newest usable
 * login tokens of that e-mail are tried; each wrong code counts an attempt on
 * them (burnt after {@link SHOP_LOGIN_MAX_ATTEMPTS}).
 */
export async function consumeShopLoginCode(rawEmail: unknown, code: string, secret: string, now: number = Date.now()) {
  const email = normalizeShopEmail(rawEmail);
  if (!email) return null;
  const rows = await prisma.shopLoginToken.findMany({
    where: {
      email,
      purpose: "login",
      usedAt: null,
      expiresAt: { gt: new Date(now) },
      attempts: { lt: SHOP_LOGIN_MAX_ATTEMPTS },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  const want = hashLoginCode(secret, email, code);
  const hit = rows.find((r) => r.codeHash === want);
  if (!hit) {
    if (rows.length) {
      await prisma.shopLoginToken.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { attempts: { increment: 1 } } });
    }
    return null;
  }
  return finishLogin(hit.id, email);
}

/** Housekeeping: drop tokens expired more than a day ago. */
export async function pruneShopLoginTokens(now: number = Date.now()): Promise<number> {
  const res = await prisma.shopLoginToken.deleteMany({ where: { expiresAt: { lt: new Date(now - 86_400_000) } } });
  return res.count;
}
