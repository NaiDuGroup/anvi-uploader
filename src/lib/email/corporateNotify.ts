import "server-only";
import { prisma } from "@/lib/prisma";
import { parseShopLang } from "@/lib/storefront/i18n";
import { sendEmail } from "./send";
import { shopPublicOrigin } from "./shopNotify";
import { renderShopEmail } from "./templates";

/**
 * «Am primit cererea» to the address of a «Pentru companii» request, in the
 * form's language. Only logged until `RESEND_API_KEY` is set (see `send.ts`).
 * Never throws; call it after the response.
 */
export async function sendCorporateReceivedEmail(requestId: string): Promise<void> {
  try {
    const r = await prisma.corporateRequest.findUnique({
      where: { id: requestId },
      select: { number: true, email: true, contactName: true, lang: true },
    });
    if (!r) return;
    const lang = parseShopLang(r.lang);
    const mail = renderShopEmail("corporate_received", lang, {
      origin: shopPublicOrigin(),
      name: r.contactName,
      orderNumber: r.number,
    });
    await sendEmail({ to: r.email, ...mail, template: "corporate_received", lang });
  } catch (e) {
    console.error(`[corporate] confirmation e-mail for ${requestId} failed:`, e);
  }
}
