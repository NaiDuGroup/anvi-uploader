import type { Metadata } from "next";
import { isShopLaunched, shopOrigin } from "./shopHost";

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Storefront layout metadata: absolute URLs on https://anvi.md, a canonical
 * for the clean path (when the middleware passed it) and noindex for the
 * whole storefront during the closed test (`SHOP_LAUNCHED` ≠ "1").
 */
export function shopLayoutMetadata(cleanPath: string | null, env: Env = process.env): Metadata {
  return {
    metadataBase: new URL(shopOrigin(env)),
    title: { default: "ANVI — produse personalizate", template: "%s · ANVI" },
    description: "Carnete, căni, tricouri și pixuri cu designul tău. Producție proprie în Chișinău, livrare în toată Moldova.",
    ...(cleanPath?.startsWith("/") ? { alternates: { canonical: cleanPath } } : {}),
    ...(isShopLaunched(env) ? {} : { robots: { index: false, follow: false } }),
  };
}
