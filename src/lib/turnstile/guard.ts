import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getCustomerSessionUser, getSessionUser } from "@/lib/auth";
import { clientIpFromHeaders } from "@/lib/rateLimit";
import { hasShopTesterCookie } from "@/lib/shop/testerAccess";
import { isShopHost } from "@/lib/storefront/shopHost";
import {
  TURNSTILE_ERROR,
  TURNSTILE_HEADER,
  TURNSTILE_PASS_COOKIE,
  turnstileConfig,
  type TurnstileAction,
} from "./config";
import { verifyTurnstile, verifyTurnstilePass } from "./verify";

/**
 * Route guards: `null` → go on, otherwise the 403 answer to return.
 *
 * - {@link guardShopTurnstile}: storefront checkout / account login. The token
 *   comes in the `x-turnstile-token` header. Staff sessions and storefront
 *   testers skip the check.
 * - {@link guardUploaderTurnstile}: walk-in uploader (`/api/upload-url`,
 *   `/api/orders`), only with `TURNSTILE_PROTECT_UPLOADER=1`. Accepts the
 *   signed pass cookie (set by `POST /api/turnstile/pass`) or a token header.
 *   Staff, cabinet customers, testers and storefront-host requests skip it.
 */

const NO_STORE = { "Cache-Control": "no-store" };

function rejected(): NextResponse {
  return NextResponse.json({ error: TURNSTILE_ERROR }, { status: 403, headers: NO_STORE });
}

async function isStaffOrTester(): Promise<boolean> {
  if (await getSessionUser()) return true;
  return hasShopTesterCookie();
}

export async function guardShopTurnstile(
  request: NextRequest,
  action: TurnstileAction,
  env: Record<string, string | undefined> = process.env,
): Promise<NextResponse | null> {
  const cfg = turnstileConfig(env);
  if (!cfg.enabled) return null;
  if (await isStaffOrTester()) return null;
  const verdict = await verifyTurnstile(request.headers.get(TURNSTILE_HEADER), {
    secretKey: cfg.secretKey,
    ip: clientIpFromHeaders(request.headers),
    action,
  });
  if (verdict.ok) return null;
  console.info(`[turnstile] ${action} rejected (${verdict.reason}${verdict.codes?.length ? `: ${verdict.codes.join(",")}` : ""})`);
  return rejected();
}

export async function guardUploaderTurnstile(
  request: NextRequest,
  env: Record<string, string | undefined> = process.env,
): Promise<NextResponse | null> {
  const cfg = turnstileConfig(env);
  if (!cfg.protectUploader || !cfg.secretKey) return null;
  // Storefront uploads (anvi.md) go through the protected checkout instead.
  if (isShopHost(request.headers.get("host") || request.nextUrl.host, env)) return null;
  if (verifyTurnstilePass(request.cookies.get(TURNSTILE_PASS_COOKIE)?.value, cfg.secretKey)) return null;
  if (await isStaffOrTester()) return null;
  if (await getCustomerSessionUser()) return null;
  const token = request.headers.get(TURNSTILE_HEADER);
  if (token) {
    const verdict = await verifyTurnstile(token, {
      secretKey: cfg.secretKey,
      ip: clientIpFromHeaders(request.headers),
      action: "upload",
    });
    if (verdict.ok) return null;
  }
  console.info(`[turnstile] uploader ${request.nextUrl.pathname} rejected (no pass)`);
  return rejected();
}
