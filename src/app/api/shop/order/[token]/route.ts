import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { RATE_LIMITS, clientIpFromHeaders, hitRateLimit, rateLimitResponseInit } from "@/lib/rateLimit";
import { loadShopOrderView, shopLineDescriber } from "@/lib/shop/orders";
import { syncPaynetOrderByToken } from "@/lib/shop/paynetSettle";
import { parseShopLang } from "@/lib/storefront/i18n";
import { loadShopLineLabels } from "@/lib/storefront/lineLabelsServer";

const NO_STORE = { "Cache-Control": "no-store" };

/** `?check=1`: at most one Paynet status call per order every few seconds (per server instance). */
const PAYNET_CHECK_GAP_MS = 2500;
const lastPaynetCheck = new Map<string, number>();

async function checkPaynet(token: string): Promise<void> {
  const now = Date.now();
  if ((lastPaynetCheck.get(token) ?? 0) > now - PAYNET_CHECK_GAP_MS) return;
  lastPaynetCheck.set(token, now);
  if (lastPaynetCheck.size > 2000) lastPaynetCheck.clear();
  try {
    await syncPaynetOrderByToken(token);
  } catch (e) {
    // Paynet unreachable: the page shows the stored state; the notification / cron settle it later.
    console.error("[shop-order] Paynet check failed:", e);
  }
}

/**
 * Storefront order status for the holder of its secret token (no costs,
 * phone or email; the courier address and note are included). 404
 * for studio orders. `?lang=ro|ru` names the lines in that language from the
 * catalog (the text stored at checkout is the fallback). `?check=1` (the
 * order page on load and while it waits after Paynet) first asks Paynet
 * about a pending Paynet order and settles it when paid.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const staff = await getSessionUser();
  if (!staff) {
    const limit = await hitRateLimit(RATE_LIMITS.shopOrder, clientIpFromHeaders(request.headers));
    if (!limit.allowed) {
      const { body, init } = rateLimitResponseInit(limit);
      return NextResponse.json(body, init);
    }
  }
  const { token } = await params;
  const langParam = request.nextUrl.searchParams.get("lang");
  try {
    if (request.nextUrl.searchParams.get("check") === "1") await checkPaynet(token);
    const lang = langParam ? parseShopLang(langParam) : null;
    const labels = lang ? await loadShopLineLabels(lang) : null;
    const view = await loadShopOrderView(token, labels && lang ? shopLineDescriber(labels, lang) : undefined);
    if (!view) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
    return NextResponse.json(view, { headers: NO_STORE });
  } catch (error) {
    console.error("[shop-order] failed:", error);
    return NextResponse.json({ error: "order_failed" }, { status: 500, headers: NO_STORE });
  }
}
