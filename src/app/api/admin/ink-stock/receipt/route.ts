import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { canManageMugCatalog } from "@/lib/roles";
import { recordInkStockReceipt } from "@/lib/ink/inkStockReceipt";
import { allocateInkProcurementBacklog } from "@/lib/allocateProcurementAfterReceipt";
import { DEFAULT_PRINT_PROCESS, type PrintProcess } from "@/lib/printProcess";

const bodySchema = z.object({
  printProcess: z
    .enum(["large_format_roll", "uv_rigid", "dtf_textile"])
    .optional(),
  quantityMl: z.number().positive().max(1_000_000_000),
  totalCostMdl: z.number().int().min(0).max(999_999_999),
  purchasedAt: z.coerce.date(),
  note: z.string().max(2000).optional().nullable(),
});

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || !canManageMugCatalog(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }

    const parsed = bodySchema.parse(body);

    const actor = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true },
    });
    let createdById: string | null = actor?.id ?? null;

    const printProcess: PrintProcess = parsed.printProcess ?? DEFAULT_PRINT_PROCESS;

    const saveReceipt = (cid: string | null) =>
      prisma.$transaction(async (tx) => {
        await recordInkStockReceipt(tx, {
          printProcess,
          quantityMl: parsed.quantityMl,
          totalCostMdl: parsed.totalCostMdl,
          purchasedAt: parsed.purchasedAt,
          note: parsed.note ?? null,
          createdById: cid,
        });
      });

    try {
      await saveReceipt(createdById);
    } catch (first) {
      if (
        first instanceof Prisma.PrismaClientKnownRequestError &&
        first.code === "P2003" &&
        createdById !== null
      ) {
        createdById = null;
        await saveReceipt(null);
      } else {
        throw first;
      }
    }

    try {
      await prisma.$transaction(async (tx) => {
        await allocateInkProcurementBacklog(tx, printProcess);
      });
    } catch (allocErr) {
      console.error("ink allocate backlog after receipt:", allocErr);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "validation_failed", details: error.flatten() },
        { status: 400 },
      );
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2021" || error.code === "P2022") {
        return NextResponse.json(
          { error: "database_schema_outdated", hint: "Run: npm run db:prepare" },
          { status: 503 },
        );
      }
      if (error.code === "P2003") {
        const field =
          error.meta && typeof error.meta === "object" && "field_name" in error.meta
            ? String(
                (error.meta as { field_name?: unknown }).field_name ?? "",
              )
            : "";
        const isUserFk = field.includes("created_by");
        return NextResponse.json(
          {
            error: "foreign_key_violation",
            hint: isUserFk
              ? "Receipt created_by user is missing in the database."
              : "Related row missing (e.g. ink inventory or user). Run migrations and ensure ink tanks exist.",
          },
          { status: 409 },
        );
      }
      // Prisma query/mapping errors often mean client/schema mismatch (e.g. stale dev server).
      if (error.code === "P2010" || error.code === "P2012") {
        return NextResponse.json(
          {
            error: "database_error",
            code: error.code,
            hint: "Restart the dev server after `npx prisma generate` and `npm run db:prepare`.",
          },
          { status: 503 },
        );
      }
    }
    console.error("ink receipt:", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
