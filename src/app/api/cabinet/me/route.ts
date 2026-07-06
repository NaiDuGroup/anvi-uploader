import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { CUSTOMER_SESSION_COOKIE, getCustomerSessionUser } from "@/lib/auth";

export async function GET() {
  const user = await getCustomerSessionUser();
  if (!user) {
    const cookieStore = await cookies();
    cookieStore.delete(CUSTOMER_SESSION_COOKIE);
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const sc = user.studioCustomer;
  return NextResponse.json({
    id: user.id,
    name: user.name,
    displayName: user.displayName,
    isDealer: sc?.isDealer ?? false,
    studioCustomer: sc
      ? {
          id: sc.id,
          kind: sc.kind,
          phone: sc.phone,
          personName: sc.personName,
          companyName: sc.companyName,
          companyIdno: sc.companyIdno,
          email: sc.email,
          isDealer: sc.isDealer,
        }
      : null,
  });
}
