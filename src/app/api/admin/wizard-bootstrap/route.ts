import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { loadWizardBootstrap } from "@/lib/wizardBootstrap";

/**
 * Returns the catalog + economics bundle the admin "New Order" / "Edit Order"
 * wizard needs to render. Mirrors `loadWizardBootstrap()` which previously
 * ran on the server during RSC render.
 *
 * Access is intentionally broader than the per-catalog admin endpoints
 * (`/api/admin/mug-products`, `/api/admin/notebook-products`): studio `admin`
 * (and workshop, via `isAdmin`) users create orders and need the mug/notebook
 * catalogs to be readable from the wizard, even though they cannot manage
 * those catalogs.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data = await loadWizardBootstrap();
  return NextResponse.json(data);
}
