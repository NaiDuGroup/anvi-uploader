import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { getCustomerSessionUser, hashPassword } from "@/lib/auth";
import { cabinetProfileUpdateSchema } from "@/lib/validations";

/**
 * Customer self-service profile update. Phone is intentionally read-only
 * here — changing the login identifier should go through superadmin (avoids
 * accidental account orphaning + lets the studio audit the change).
 */
export async function PATCH(request: NextRequest) {
  const user = await getCustomerSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const data = cabinetProfileUpdateSchema.parse(body);

    const sc = user.studioCustomer!;

    const personName = data.personName?.trim();
    const companyName = data.companyName?.trim();
    const companyIdno = data.companyIdno?.trim();
    const email = data.email?.trim();

    await prisma.$transaction(async (tx) => {
      await tx.studioCustomer.update({
        where: { id: sc.id },
        data: {
          ...(personName !== undefined ? { personName: personName || null } : {}),
          ...(companyName !== undefined ? { companyName: companyName || null } : {}),
          ...(companyIdno !== undefined ? { companyIdno: companyIdno || null } : {}),
          ...(email !== undefined ? { email: email || null } : {}),
        },
      });

      if (data.password) {
        await tx.user.update({
          where: { id: user.id },
          data: { password: hashPassword(data.password) },
        });
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.flatten() },
        { status: 400 },
      );
    }
    console.error("Cabinet profile update error:", error);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
