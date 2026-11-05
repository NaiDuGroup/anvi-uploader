import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canViewShopAdmin } from "@/lib/shop/report/access";
import { promoDatesToDb, promoInputSchema } from "@/lib/shop/promo/promoAdmin";
import { listPromoCodes, promoProductOptions, PROMO_CATEGORY_OPTIONS } from "@/lib/shop/promo/promoAdminServer";

const NO_STORE = { "Cache-Control": "no-store" };

/** «Промокоды»: the list (+ the category / product options for the form). Staff: admin, superadmin. */
export async function GET() {
  const user = await getSessionUser();
  if (!user || !canViewShopAdmin(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const [codes, products] = await Promise.all([listPromoCodes(), promoProductOptions()]);
  return NextResponse.json(
    { codes, options: { categories: PROMO_CATEGORY_OPTIONS, products } },
    { headers: NO_STORE },
  );
}

/** Create a promo code. 409 `code_taken` when the code exists. */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || !canViewShopAdmin(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = promoInputSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
  }
  const d = parsed.data;
  try {
    const created = await prisma.promoCode.create({
      data: { ...d, ...promoDatesToDb(d.validFrom, d.validTo), createdBy: user.id },
    });
    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "code_taken" }, { status: 409 });
    }
    console.error("[promo-codes] create failed:", e);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
}
