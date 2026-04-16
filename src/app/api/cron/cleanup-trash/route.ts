import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const TRASH_RETENTION_DAYS = 31;

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 86_400_000);

    const { count } = await prisma.order.deleteMany({
      where: {
        deletedAt: { not: null, lt: cutoff },
      },
    });

    return NextResponse.json({ ok: true, purged: count });
  } catch (error) {
    console.error("Trash cleanup failed:", error);
    return NextResponse.json(
      { error: "Trash cleanup failed" },
      { status: 500 },
    );
  }
}
