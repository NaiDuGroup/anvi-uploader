import "server-only";
import { getOrCreateCompanyProfile } from "@/lib/invoice/companyProfile";
import { prisma } from "@/lib/prisma";

/**
 * «Оплата только при получении (временно)» — super-admin switch in the admin
 * «Сайт» tab, stored in `CompanyProfile.shopPayOnDelivery` (default ON). While
 * on, the storefront takes no online payment: checkout creates the order with
 * `paymentProvider='on_delivery'` and it goes straight to work; the customer
 * pays at hand-over. See `shopPaymentState` / `resolvePaymentProvider`.
 *
 * A failed read counts as ON: taking an order to be paid later is safer than
 * sending customers to a payment page that may not work.
 */
export async function isShopPayOnDelivery(): Promise<boolean> {
  try {
    const p = await getOrCreateCompanyProfile();
    return p.shopPayOnDelivery !== false;
  } catch (e) {
    console.error("[shop] pay-on-delivery switch read failed:", e);
    return true;
  }
}

/** Super admin: turn the switch on / off (no redeploy needed). */
export async function setShopPayOnDelivery(on: boolean): Promise<boolean> {
  const p = await getOrCreateCompanyProfile();
  const updated = await prisma.companyProfile.update({
    where: { id: p.id },
    data: { shopPayOnDelivery: on },
    select: { shopPayOnDelivery: true },
  });
  return updated.shopPayOnDelivery;
}
