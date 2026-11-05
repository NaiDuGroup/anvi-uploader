import "server-only";
import { z } from "zod";
import { round2 } from "@/lib/money";
import { quotePublicLines } from "@/lib/publicQuote/publicQuote";
import { SHOP_LANGS } from "@/lib/storefront/i18n";
import { SHOP_CHECKOUT_MAX_LINES, SHOP_DELIVERY_METHODS } from "../constants";
import { shopDeliveryPriceMdl } from "../delivery";
import type { PromoRejectReason } from "./promoCore";
import { applyShopPromo } from "./promoServer";

type Env = Readonly<Record<string, string | undefined>>;

/**
 * `POST /api/shop/promo` («Aplică» in the checkout): the cart is re-priced
 * by the same quote engine as the checkout and the code checked by the same
 * `applyShopPromo`. Only a preview — the checkout checks everything again.
 */
export const promoPreviewSchema = z.object({
  code: z.string().trim().min(1).max(60),
  locale: z.enum(SHOP_LANGS).default("ro"),
  lines: z.array(z.object({ quote: z.unknown() })).min(1).max(SHOP_CHECKOUT_MAX_LINES),
  delivery: z.object({ method: z.enum(SHOP_DELIVERY_METHODS) }),
  email: z
    .union([z.string().trim().email().max(200), z.literal("")])
    .optional()
    .transform((v) => (v ? v.toLowerCase() : undefined)),
});

export type PromoPreviewAnswer =
  | {
      ok: true;
      code: string;
      type: string;
      discount: number;
      subtotal: number;
      deliveryPrice: number;
      total: number;
    }
  | { ok: false; reason: PromoRejectReason | "invalid_input" | "cart_unavailable"; minOrderMdl?: number };

export async function previewShopPromo(raw: unknown, env: Env = process.env): Promise<PromoPreviewAnswer> {
  const parsed = promoPreviewSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid_input" };
  const req = parsed.data;
  const quote = await quotePublicLines(
    req.lines.map((l) => l.quote),
    req.locale,
  );
  const priced: { quote: unknown; total: number }[] = [];
  for (let i = 0; i < req.lines.length; i++) {
    const q = quote.lines[i];
    if (!q || !q.ok) return { ok: false, reason: "cart_unavailable" };
    priced.push({ quote: req.lines[i]!.quote, total: q.total });
  }
  const deliveryPrice: number = shopDeliveryPriceMdl(req.delivery.method, env);
  const r = await applyShopPromo({ code: req.code, lines: priced, deliveryPrice, email: req.email ?? null });
  if (!r.ok) return { ok: false, reason: r.reason, ...(r.minOrderMdl != null ? { minOrderMdl: r.minOrderMdl } : {}) };
  return {
    ok: true,
    code: r.code,
    type: r.type,
    discount: r.discount,
    subtotal: r.subtotal,
    deliveryPrice: r.deliveryPrice,
    total: round2(r.total),
  };
}
