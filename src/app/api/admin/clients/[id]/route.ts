import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { createClientBodySchema } from "@/lib/validations";
import { normalizedPhoneForDb } from "@/lib/studioClient";

function requireAdmin(user: Awaited<ReturnType<typeof getSessionUser>>) {
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") {
    return NextResponse.json(
      { error: "Forbidden: only studio admin can manage clients" },
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
  const client = await prisma.studioCustomer.findUnique({ where: { id } });
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
  const denied = requireAdmin(user);
  if (denied) return denied;

  const { id } = await params;
  const existing = await prisma.studioCustomer.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const merged = {
      kind: body.kind ?? existing.kind,
      phone: body.phone !== undefined ? body.phone : existing.phone ?? undefined,
      personName:
        body.personName !== undefined ? body.personName : existing.personName ?? undefined,
      companyName:
        body.companyName !== undefined ? body.companyName : existing.companyName ?? undefined,
      companyIdno:
        body.companyIdno !== undefined ? body.companyIdno : existing.companyIdno ?? undefined,
      companyIban:
        body.companyIban !== undefined ? body.companyIban : existing.companyIban ?? undefined,
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
        companyIban: validated.companyIban?.trim() || null,
      },
    });

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
  const denied = requireAdmin(user);
  if (denied) return denied;

  const { id } = await params;
  try {
    await prisma.studioCustomer.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
