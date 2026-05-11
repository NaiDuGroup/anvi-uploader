import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";

export interface InvoiceAuthor {
  id: string;
  name: string;
  /** Number of invoices created by this user (for sorting / hinting). */
  invoiceCount: number;
}

/**
 * GET /api/admin/invoice-authors
 *
 * Returns the list of users who have created at least one invoice. Used by the
 * admin invoices page to populate the "Author" filter without exposing the
 * full users table to non-superadmin staff.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(user.role)) {
    return NextResponse.json(
      { error: "Forbidden: studio admin only" },
      { status: 403 },
    );
  }

  try {
    const grouped = await prisma.invoice.groupBy({
      by: ["createdById"],
      _count: { _all: true },
      where: { createdById: { not: null } },
    });

    const ids = grouped
      .map((g) => g.createdById)
      .filter((id): id is string => typeof id === "string" && id.length > 0);

    if (ids.length === 0) {
      return NextResponse.json({ authors: [] satisfies InvoiceAuthor[] });
    }

    const users = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, displayName: true },
    });

    const countById = new Map<string, number>();
    for (const g of grouped) {
      if (g.createdById) countById.set(g.createdById, g._count._all);
    }

    const authors: InvoiceAuthor[] = users
      .map((u) => ({
        id: u.id,
        name: u.displayName?.trim() || u.name,
        invoiceCount: countById.get(u.id) ?? 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ authors });
  } catch (error) {
    console.error("GET /api/admin/invoice-authors:", error);
    const message =
      error instanceof Error ? error.message : "Failed to load authors";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
