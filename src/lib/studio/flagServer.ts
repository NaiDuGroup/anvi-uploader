import "server-only";
import { hasShopTesterAccess } from "@/lib/shop/testerAccess";
import { isStudioCardEnabled, isStudioEditorEnabled, isStudioFlyerEnabled } from "./flag";

/** The Studio is open for this request (flag, tester pass or staff session). */
export async function studioEditorAllowed(env: Readonly<Record<string, string | undefined>> = process.env): Promise<boolean> {
  if (isStudioEditorEnabled(env)) return true;
  return isStudioEditorEnabled(env, { tester: await hasShopTesterAccess() });
}

/** The business-card Studio is open for this request (`SHOP_STUDIO_CARD=1`, tester pass or staff session). */
export async function studioCardAllowed(env: Readonly<Record<string, string | undefined>> = process.env): Promise<boolean> {
  if (isStudioCardEnabled(env)) return true;
  return isStudioCardEnabled(env, { tester: await hasShopTesterAccess() });
}

/** The flyer Studio is open for this request (`SHOP_STUDIO_FLYER=1`, tester pass or staff session). */
export async function studioFlyerAllowed(env: Readonly<Record<string, string | undefined>> = process.env): Promise<boolean> {
  if (isStudioFlyerEnabled(env)) return true;
  return isStudioFlyerEnabled(env, { tester: await hasShopTesterAccess() });
}
