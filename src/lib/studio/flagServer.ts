import "server-only";
import { hasShopTesterAccess } from "@/lib/shop/testerAccess";
import { isStudioEditorEnabled } from "./flag";

/** The Studio is open for this request (flag, tester pass or staff session). */
export async function studioEditorAllowed(env: Readonly<Record<string, string | undefined>> = process.env): Promise<boolean> {
  if (isStudioEditorEnabled(env)) return true;
  return isStudioEditorEnabled(env, { tester: await hasShopTesterAccess() });
}
