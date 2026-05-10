import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser, hashPassword } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { clientPortalAccountSchema } from "@/lib/validations";
import { normalizedPhoneForDb } from "@/lib/studioClient";

function requireSuperAdmin(user: Awaited<ReturnType<typeof getSessionUser>>) {
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(user.role)) {
    return NextResponse.json(
      { error: "Forbidden: superadmin only" },
      { status: 403 },
    );
  }
  return null;
}

/**
 * Creates (or fails noisily) a portal account for an existing studio
 * customer. Used by the "Создать кабинет" button on a client row. The
 * superadmin manually relays the password to the dealer until we have an
 * SMS / email channel.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  const denied = requireSuperAdmin(user);
  if (denied) return denied;

  try {
    const { id } = await params;
    const body = await request.json();
    const { password } = clientPortalAccountSchema.parse(body);

    const customer = await prisma.studioCustomer.findUnique({
      where: { id },
      include: { userAccount: true },
    });
    if (!customer) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }
    if (customer.userAccount) {
      return NextResponse.json(
        { error: "Portal account already exists for this client" },
        { status: 409 },
      );
    }

    const phoneNorm = normalizedPhoneForDb(customer.phone);
    if (!phoneNorm) {
      return NextResponse.json(
        { error: "Client must have a valid phone before a portal account can be created" },
        { status: 400 },
      );
    }

    // A different User may already have grabbed this phone (e.g. earlier
    // self-registration). Refuse to silently overwrite.
    const existingUserOnPhone = await prisma.user.findUnique({
      where: { phoneNormalized: phoneNorm },
    });
    if (existingUserOnPhone) {
      return NextResponse.json(
        { error: "A user account with this phone already exists" },
        { status: 409 },
      );
    }

    const personName = customer.personName?.trim() || null;
    const companyName = customer.companyName?.trim() || null;
    const userName =
      personName || companyName || customer.phone || `client-${customer.id.slice(0, 8)}`;

    const created = await prisma.user.create({
      data: {
        name: userName,
        displayName: personName || companyName || null,
        role: "customer",
        password: hashPassword(password),
        phoneNormalized: phoneNorm,
        studioCustomerId: customer.id,
      },
      select: { id: true, name: true, displayName: true },
    });

    return NextResponse.json(
      {
        user: created,
        // Echoed once so the superadmin can copy + hand over to the dealer.
        // Never stored in plaintext anywhere; the client UI should not log it.
        password,
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
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "A portal account with this identifier already exists" },
        { status: 409 },
      );
    }
    console.error("Failed to create portal account:", error);
    return NextResponse.json(
      { error: "Failed to create portal account" },
      { status: 500 },
    );
  }
}

/**
 * Removes the portal account and its sessions, but keeps the StudioCustomer
 * intact (their order history / contact info should outlive the login).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  const denied = requireSuperAdmin(user);
  if (denied) return denied;

  const { id } = await params;
  const customer = await prisma.studioCustomer.findUnique({
    where: { id },
    include: { userAccount: true },
  });
  if (!customer) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }
  if (!customer.userAccount) {
    return NextResponse.json({ ok: true });
  }
  await prisma.session.deleteMany({ where: { userId: customer.userAccount.id } });
  await prisma.user.delete({ where: { id: customer.userAccount.id } });
  return NextResponse.json({ ok: true });
}
