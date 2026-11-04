import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { quotePublicLines } from "@/lib/publicQuote/publicQuote";
import { publicQuoteRequestSchema } from "@/lib/publicQuote/publicQuoteSchema";
import { RATE_LIMITS, clientIpFromHeaders, hitRateLimit, rateLimitResponseInit } from "@/lib/rateLimit";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Storefront price quote: the retail price of each cart line (final prices
 * only — no costs or margins), computed by the same engines as order
 * creation. Always retail: the tier is never read from the client, and
 * dealers keep pricing in the cabinet. Anonymous callers are rate-limited
 * per IP; staff sessions are not.
 */
export async function POST(request: NextRequest) {
  const staff = await getSessionUser();
  if (!staff) {
    const limit = await hitRateLimit(RATE_LIMITS.publicQuote, clientIpFromHeaders(request.headers));
    if (!limit.allowed) {
      const { body, init } = rateLimitResponseInit(limit);
      return NextResponse.json(body, init);
    }
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: NO_STORE });
  }
  const parsed = publicQuoteRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400, headers: NO_STORE });
  }

  try {
    const result = await quotePublicLines(parsed.data.lines, parsed.data.locale);
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (error) {
    console.error("[public-quote] failed:", error);
    return NextResponse.json({ error: "quote_failed" }, { status: 500, headers: NO_STORE });
  }
}
