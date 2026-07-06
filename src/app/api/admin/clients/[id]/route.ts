import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isAdmin, isSuperAdmin } from "@/lib/roles";
import { createClientBodySchema } from "@/lib/validations";
import { normalizedPhoneForDb } from "@/lib/studioClient";

function requireAdmin(user: Awaited<ReturnType<typeof getSessionUser>>) {
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(user.role)) {
    return NextResponse.json(
      { error: "Forbidden: only studio admin can manage clients" },
      { status: 403 },
    );
  }
  return null;
}

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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  const denied = requireAdmin(user);
  if (denied) return denied;

  const { id } = await params;
  const client = await prisma.studioCustomer.findUnique({
    where: { id },
    include: { userAccount: { select: { id: true, name: true } } },
  });
  if (!client) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(client);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  const denied = requireSuperAdmin(user);
  if (denied) return denied;

  const { id } = await params;
  const existing = await prisma.studioCustomer.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const body = await request.json();

    // `isDealer` and `email` may be sent on their own without a full client
    // payload. Otherwise we still go through `createClientBodySchema` so that
    // kind-specific validation (LEGAL needs IDNO, etc.) keeps holding.
    const isDealerUpdate =
      typeof body.isDealer === "boolean" ? body.isDealer : undefined;
    const emailUpdate =
      typeof body.email === "string" || body.email === null
        ? body.email
        : undefined;

    const merged = {
      kind: body.kind ?? existing.kind,
      phone: body.phone !== undefined ? body.phone : existing.phone ?? undefined,
      personName:
        body.personName !== undefined ? body.personName : existing.personName ?? undefined,
      companyName:
        body.companyName !== undefined ? body.companyName : existing.companyName ?? undefined,
      companyIdno:
        body.companyIdno !== undefined ? body.companyIdno : existing.companyIdno ?? undefined,
    };
    const validated = createClientBodySchema.parse(merged);

    const phoneNorm =
      validated.kind === "INDIVIDUAL"
        ? normalizedPhoneForDb(validated.phone!)
        : normalizedPhoneForDb(validated.phone?.trim() ?? "") ?? null;

    if (validated.kind === "INDIVIDUAL" && phoneNorm) {
      const dup = await prisma.studioCustomer.findFirst({
        where: {
          kind: "INDIVIDUAL",
          phoneNormalized: phoneNorm,
          NOT: { id },
        },
        select: { id: true },
      });
      if (dup) {
        return NextResponse.json(
          { error: "A client with this phone already exists" },
          { status: 409 },
        );
      }
    }

    const client = await prisma.studioCustomer.update({
      where: { id },
      data: {
        kind: validated.kind,
        phone: validated.phone?.trim() || null,
        phoneNormalized: phoneNorm,
        personName: validated.personName?.trim() || null,
        companyName: validated.companyName?.trim() || null,
        companyIdno: validated.companyIdno?.trim() || null,
        ...(isDealerUpdate !== undefined ? { isDealer: isDealerUpdate } : {}),
        ...(emailUpdate !== undefined
          ? { email: typeof emailUpdate === "string" ? emailUpdate.trim() || null : null }
          : {}),
      },
      include: { userAccount: { select: { id: true, name: true } } },
    });

    // Keep the linked User row in sync if the client's normalized phone changed
    // (so cabinet login by phone keeps working after edits).
    if (client.userAccount && phoneNorm && phoneNorm !== existing.phoneNormalized) {
      await prisma.user.update({
        where: { id: client.userAccount.id },
        data: { phoneNormalized: phoneNorm },
      });
    }

    return NextResponse.json(client);
  } catch (error) {
    console.error("Failed to update client:", error);
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.flatten() },
        { status: 400 },
      );
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 400 },
      );
    }
    if (error instanceof Prisma.PrismaClientValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message =
      error instanceof Error ? error.message : "Failed to update client";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  const denied = requireSuperAdmin(user);
  if (denied) return denied;

  const { id } = await params;
  try {
    // Cascade: drop the linked portal account so we don't leave an orphan login.
    const client = await prisma.studioCustomer.findUnique({
      where: { id },
      include: { userAccount: true },
    });
    if (!client) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (client.userAccount) {
      await prisma.session.deleteMany({ where: { userId: client.userAccount.id } });
      await prisma.user.delete({ where: { id: client.userAccount.id } });
    }
    await prisma.studioCustomer.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
