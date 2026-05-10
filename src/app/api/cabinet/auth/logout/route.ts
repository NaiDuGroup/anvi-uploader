import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { CUSTOMER_SESSION_COOKIE, deleteSession } from "@/lib/auth";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value;

    if (token) {
      await deleteSession(token);
    }

    cookieStore.delete(CUSTOMER_SESSION_COOKIE);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Cabinet logout error:", error);
    return NextResponse.json({ error: "Logout failed" }, { status: 500 });
  }
}
