import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runAfter } from "@/lib/runAfter";
import { sendShopLoginEmail } from "@/lib/email/shopNotify";
import { RATE_LIMITS, clientIpFromHeaders, hitRateLimit, rateLimitResponseInit } from "@/lib/rateLimit";
import { issueShopLoginToken } from "@/lib/shop/account/customers";
import { normalizeShopEmail, shopSessionSecret } from "@/lib/shop/account/tokens";
import { parseShopLang } from "@/lib/storefront/i18n";
import { guardShopTurnstile } from "@/lib/turnstile/guard";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * `POST /api/shop/account/login` `{ email, lang }` — e-mails a one-time
 * login link + 6-digit code (15 min). Always answers `{ ok: true }` for a
 * well-formed address, whether or not an account exists (the account is
 * created when the link / code is used). Rate-limited per IP and per address.
 */
export async function POST(request: NextRequest) {
  const ip = clientIpFromHeaders(request.headers);
  const byIp = await hitRateLimit(RATE_LIMITS.shopLogin, ip);
  if (!byIp.allowed) {
    const { body, init } = rateLimitResponseInit(byIp);
    return NextResponse.json(body, init);
  }
  // Cloudflare Turnstile (off without its keys; staff / testers skip it).
  const blocked = await guardShopTurnstile(request, "login");
  if (blocked) return blocked;
  type Body = { email?: unknown; lang?: unknown } | null;
  let raw: Body;
  try {
    raw = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: NO_STORE });
  }
  const email = normalizeShopEmail(raw?.email);
  if (!email) return NextResponse.json({ error: "invalid_email" }, { status: 400, headers: NO_STORE });
  const secret = shopSessionSecret();
  if (!secret) return NextResponse.json({ error: "accounts_unavailable" }, { status: 503, headers: NO_STORE });

  const emailKey = createHash("sha256").update(email).digest("hex").slice(0, 32);
  const byEmail = await hitRateLimit(RATE_LIMITS.shopLoginEmail, emailKey);
  // Too many for this address: same answer as success (nothing is sent), so the limit reveals nothing.
  if (!byEmail.allowed) return NextResponse.json({ ok: true }, { headers: NO_STORE });

  const lang = parseShopLang(typeof raw?.lang === "string" ? raw.lang : null);
  try {
    const issued = await issueShopLoginToken(email, secret, {
      purpose: "login",
      ip,
      userAgent: request.headers.get("user-agent"),
    });
    runAfter(() => sendShopLoginEmail({ email, token: issued.token, code: issued.code!, lang }));
  } catch (e) {
    console.error("[shop-login] failed:", e);
    return NextResponse.json({ error: "login_failed" }, { status: 500, headers: NO_STORE });
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
