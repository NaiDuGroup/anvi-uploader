import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, hashPassword } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import { z } from "zod";

const ALLOWED_ROLES = ["admin", "workshop", "superadmin"] as const;

const createUserSchema = z.object({
  name: z.string().min(1).max(255),
  displayName: z.string().min(1).max(255).optional(),
  role: z.enum(ALLOWED_ROLES),
  password: z.string().min(6),
});

function requireSuperAdmin(user: Awaited<ReturnType<typeof getSessionUser>>) {
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden: superadmin only" }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const user = await getSessionUser();
  const err = requireSuperAdmin(user);
  if (err) return err;

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      displayName: true,
      role: true,
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(users);
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  const err = requireSuperAdmin(user);
  if (err) return err;

  try {
    const body = await request.json();
    const data = createUserSchema.parse(body);

    const existing = await prisma.user.findFirst({
      where: { name: data.name },
    });
    if (existing) {
      return NextResponse.json(
        { error: "A user with this login already exists" },
        { status: 409 },
      );
    }

    const created = await prisma.user.create({
      data: {
        name: data.name,
        displayName: data.displayName ?? null,
        role: data.role,
        password: hashPassword(data.password),
      },
      select: {
        id: true,
        name: true,
        displayName: true,
        role: true,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.flatten() },
        { status: 400 },
      );
    }
    console.error("Failed to create user:", error);
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}
