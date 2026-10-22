import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { canManagePurchases } from "@/lib/roles";
import { getPurchaseInvoiceDetail } from "@/lib/purchasing/purchaseQueries";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user || !canManagePurchases(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const { id } = await params;
    const detail = await getPurchaseInvoiceDetail(id);
    if (!detail) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(detail);
  } catch (error) {
    console.error("purchase invoice detail:", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
