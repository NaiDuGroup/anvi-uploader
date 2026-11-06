import "server-only";
import { hasShopTesterAccess } from "@/lib/shop/testerAccess";
import { isStudioCardEnabled, isStudioEditorEnabled } from "./flag";

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
