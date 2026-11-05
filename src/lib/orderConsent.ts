import type { Locale } from "@/lib/i18n/types";

/**
 * Version of the consent checkbox text on the guest upload forms (homepage, mug,
 * notebook, pen). Bump it whenever `upload.gdprConsent*` or the privacy policy
 * change in substance: the order keeps the version the
 * guest agreed to (`orders.consent_version`).
 */
export const ORDER_CONSENT_VERSION = "2026-11-05";

/** Privacy policy on the storefront (anvi.md). Language via `?lang=` (sets `shop_lang`). */
export const PRIVACY_POLICY_URL = "https://anvi.md/confidentialitate";

export function privacyPolicyUrl(locale: Locale): string {
  return locale === "ro" ? PRIVACY_POLICY_URL : `${PRIVACY_POLICY_URL}?lang=${locale}`;
}

/** Body field the guest forms send with `POST /api/orders`. */
export type OrderConsentPayload = { files: true; data: true; version: string };

export function orderConsentPayload(): OrderConsentPayload {
  return { files: true, data: true, version: ORDER_CONSENT_VERSION };
}
