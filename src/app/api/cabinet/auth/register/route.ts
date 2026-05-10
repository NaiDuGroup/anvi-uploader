import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import {
  CUSTOMER_SESSION_COOKIE,
  createSession,
  hashPassword,
} from "@/lib/auth";
import { cabinetRegisterSchema } from "@/lib/validations";
import { normalizedPhoneForDb } from "@/lib/studioClient";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = cabinetRegisterSchema.parse(body);

    const phoneNorm = normalizedPhoneForDb(data.phone);
    if (!phoneNorm) {
      return NextResponse.json(
        { error: "Validation failed", details: { fieldErrors: { phone: ["phone_required"] } } },
        { status: 400 },
      );
    }

    // 1. If a User with this phone already exists, registration is blocked —
    //    the account is already on file. We never reuse passwords silently.
    const existingUser = await prisma.user.findUnique({
      where: { phoneNormalized: phoneNorm },
    });
    if (existingUser) {
      return NextResponse.json(
        { error: "An account with this phone already exists" },
        { status: 409 },
      );
    }

    // 2. Try to attach to an existing StudioCustomer with the same normalized
    //    phone — this is how returning customers (already in our CRM)
    //    self-onboard onto the portal without losing their order history.
    //    Fall back to creating a fresh StudioCustomer otherwise.
    const studioCustomer = await prisma.studioCustomer.findFirst({
      where: { phoneNormalized: phoneNorm },
    });

    const personName = data.personName?.trim() || null;
    const companyName = data.companyName?.trim() || null;
    const companyIdno = data.companyIdno?.trim() || null;
    const companyIban = data.companyIban?.trim() || null;
    const email = data.email?.trim() || null;

    const result = await prisma.$transaction(async (tx) => {
      let scId: string;
      if (studioCustomer) {
        // Don't allow hijacking an existing card that already has a portal account.
        if (
          await tx.user.findUnique({
            where: { studioCustomerId: studioCustomer.id },
          })
        ) {
          throw new Error("PORTAL_ACCOUNT_EXISTS");
        }
        const updated = await tx.studioCustomer.update({
          where: { id: studioCustomer.id },
          data: {
            kind: data.kind,
            phone: data.phone,
            phoneNormalized: phoneNorm,
            // Only fill empty fields — never overwrite info the studio already curated.
            personName: studioCustomer.personName ?? personName,
            companyName: studioCustomer.companyName ?? companyName,
            companyIdno: studioCustomer.companyIdno ?? companyIdno,
            companyIban: studioCustomer.companyIban ?? companyIban,
            email: studioCustomer.email ?? email,
          },
        });
        scId = updated.id;
      } else {
        const created = await tx.studioCustomer.create({
          data: {
            kind: data.kind,
            phone: data.phone,
            phoneNormalized: phoneNorm,
            personName,
            companyName,
            companyIdno,
            companyIban,
            email,
          },
        });
        scId = created.id;
      }

      const userName = personName || companyName || data.phone;
      const user = await tx.user.create({
        data: {
          name: userName,
          displayName: personName || companyName || null,
          role: "customer",
          password: hashPassword(data.password),
          phoneNormalized: phoneNorm,
          studioCustomerId: scId,
        },
      });
      return { user, studioCustomerId: scId };
    });

    const token = await createSession(result.user.id);

    const cookieStore = await cookies();
    cookieStore.set(CUSTOMER_SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });

    return NextResponse.json(
      {
        id: result.user.id,
        name: result.user.name,
        displayName: result.user.displayName,
        studioCustomerId: result.studioCustomerId,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.flatten() },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message === "PORTAL_ACCOUNT_EXISTS") {
      return NextResponse.json(
        { error: "An account with this phone already exists" },
        { status: 409 },
      );
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: "An account with this phone already exists" },
        { status: 409 },
      );
    }
    console.error("Cabinet register error:", error);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
