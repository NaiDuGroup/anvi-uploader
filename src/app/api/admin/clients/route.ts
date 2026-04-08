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

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser();
    const denied = requireAdmin(user);
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim() ?? "";
    const take = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10) || 50),
    );

    const where =
      search.length > 0
        ? {
            OR: [
              { personName: { contains: search, mode: "insensitive" as const } },
              { companyName: { contains: search, mode: "insensitive" as const } },
              { phone: { contains: search, mode: "insensitive" as const } },
              { companyIdno: { contains: search, mode: "insensitive" as const } },
              { companyIban: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {};

    const clients = await prisma.studioCustomer.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take,
      select: {
        id: true,
        kind: true,
        phone: true,
        personName: true,
        companyName: true,
        companyIdno: true,
        companyIban: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ clients });
  } catch (error) {
    console.error("GET /api/admin/clients:", error);
    const dev = process.env.NODE_ENV === "development";
    const message =
      error instanceof Error ? error.message : "Failed to load clients";
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return NextResponse.json(
        {
          error: dev ? message : "Database error",
          code: error.code,
          ...(dev ? { meta: error.meta } : {}),
        },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: dev ? message : "Failed to load clients" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  const denied = requireAdmin(user);
  if (denied) return denied;

  try {
    const body = await request.json();
    const validated = createClientBodySchema.parse(body);

    const phoneNorm =
      validated.kind === "INDIVIDUAL"
        ? normalizedPhoneForDb(validated.phone!)
        : normalizedPhoneForDb(validated.phone?.trim() ?? "") ?? null;

    if (validated.kind === "INDIVIDUAL" && phoneNorm) {
      const dup = await prisma.studioCustomer.findFirst({
        where: { kind: "INDIVIDUAL", phoneNormalized: phoneNorm },
        select: { id: true },
      });
      if (dup) {
        return NextResponse.json(
          { error: "A client with this phone already exists" },
          { status: 409 },
        );
      }
    }

    const client = await prisma.studioCustomer.create({
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

    return NextResponse.json(client, { status: 201 });
  } catch (error) {
    console.error("Failed to create client:", error);
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
      error instanceof Error ? error.message : "Failed to create client";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
