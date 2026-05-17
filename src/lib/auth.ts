import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import type { Prisma, StudioCustomer, User } from "@prisma/client";
import { prisma } from "./prisma";

export const ADMIN_SESSION_COOKIE = "admin_session";
export const CUSTOMER_SESSION_COOKIE = "customer_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Back-compat alias. New code should import {@link ADMIN_SESSION_COOKIE} or
 * {@link CUSTOMER_SESSION_COOKIE} explicitly.
 */
export const SESSION_COOKIE = ADMIN_SESSION_COOKIE;

export type SessionAudience = "admin" | "customer";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  const hashBuf = Buffer.from(hash, "hex");
  const suppliedBuf = scryptSync(password, salt, 64);
  return timingSafeEqual(hashBuf, suppliedBuf);
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await prisma.session.create({
    data: {
      userId,
      token,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  return token;
}

async function readSessionUser<T extends Prisma.UserInclude | undefined>(
  cookieName: string,
  include?: T,
): Promise<
  | (T extends Prisma.UserInclude ? Prisma.UserGetPayload<{ include: T }> : User)
  | null
> {
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: include ? { include } : true },
  });

  if (!session || session.expiresAt < new Date()) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } });
    }
    return null;
  }

  return session.user as
    | (T extends Prisma.UserInclude ? Prisma.UserGetPayload<{ include: T }> : User)
    | null;
}

/**
 * Staff session (admin / superadmin / workshop). Reads {@link ADMIN_SESSION_COOKIE}.
 * Refuses any user whose role is `customer` even if their token is valid for that
 * cookie (defence-in-depth: a customer must never end up in /admin).
 *
 * Wrapped in `React.cache()` so that the protected layout and any page rendered
 * in the same RSC request share a single Prisma round-trip to `sessions+users`.
 * In non-RSC contexts (API route handlers) `cache()` is a no-op pass-through.
 */
export const getSessionUser = cache(async (): Promise<User | null> => {
  const user = await readSessionUser(ADMIN_SESSION_COOKIE);
  if (!user) return null;
  if (user.role === "customer") return null;
  return user;
});

export type CustomerUser = User & { studioCustomer: StudioCustomer | null };

/**
 * Customer-portal session. Reads {@link CUSTOMER_SESSION_COOKIE} and requires
 * `role === "customer"` plus a linked `StudioCustomer`. Used by /cabinet/* and
 * by session-aware public order endpoints to determine dealer pricing.
 *
 * Wrapped in `React.cache()` (same rationale as {@link getSessionUser}).
 */
export const getCustomerSessionUser = cache(async (): Promise<CustomerUser | null> => {
  const user = await readSessionUser(CUSTOMER_SESSION_COOKIE, {
    studioCustomer: true,
  });
  if (!user) return null;
  if (user.role !== "customer") return null;
  if (!user.studioCustomer) return null;
  return user as CustomerUser;
});

/**
 * Soft variant for public pages (`/`, `/mug`, `/notebook`) that should still
 * work for anonymous visitors. Returns `null` when no valid customer session
 * cookie is present. Shares the same `React.cache()` instance as
 * {@link getCustomerSessionUser} so multiple consumers in one RSC request
 * de-duplicate to a single DB lookup.
 */
export const getMaybeCustomerUser = getCustomerSessionUser;

export async function deleteSession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { token } });
}
