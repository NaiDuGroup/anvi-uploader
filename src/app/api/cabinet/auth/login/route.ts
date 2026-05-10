import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import {
  CUSTOMER_SESSION_COOKIE,
  createSession,
  verifyPassword,
} from "@/lib/auth";
import { cabinetLoginSchema } from "@/lib/validations";
import { normalizedPhoneForDb } from "@/lib/studioClient";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phone, password } = cabinetLoginSchema.parse(body);

    const phoneNorm = normalizedPhoneForDb(phone);
    if (!phoneNorm) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { phoneNormalized: phoneNorm },
    });

    if (
      !user ||
      user.role !== "customer" ||
      !verifyPassword(password, user.password)
    ) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const token = await createSession(user.id);

    const cookieStore = await cookies();
    cookieStore.set(CUSTOMER_SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });

    return NextResponse.json({
      id: user.id,
      name: user.name,
      displayName: user.displayName,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.flatten() },
        { status: 400 },
      );
    }
    console.error("Cabinet login error:", error);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
