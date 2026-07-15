import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import {
  BANK_STATEMENT_INCLUDE,
  BANK_TRANSACTION_INCLUDE,
  toSerializableBankStatement,
  toSerializableBankTransaction,
} from "@/lib/reconciliation/serialize";

export const runtime = "nodejs";

function requireStaff(user: Awaited<ReturnType<typeof getSessionUser>>) {
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(user.role)) {
    return NextResponse.json(
      { error: "Forbidden: studio admin only" },
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
  const denied = requireStaff(user);
  if (denied) return denied;

  const { id } = await params;
  try {
    const statement = await prisma.bankStatement.findUnique({
      where: { id },
      include: BANK_STATEMENT_INCLUDE,
    });
    if (!statement) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const transactions = await prisma.bankTransaction.findMany({
      where: { statementId: id },
      include: BANK_TRANSACTION_INCLUDE,
      orderBy: [{ bookingDate: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json({
      statement: toSerializableBankStatement(statement),
      transactions: transactions.map(toSerializableBankTransaction),
    });
  } catch (error) {
    console.error("GET /api/admin/bank-statements/[id]:", error);
    return NextResponse.json(
      { error: "Failed to load statement" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  const denied = requireStaff(user);
  if (denied) return denied;

  const { id } = await params;
  try {
    // Transactions cascade-delete; their allocations cascade in turn.
    await prisma.bankStatement.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/admin/bank-statements/[id]:", error);
    return NextResponse.json(
      { error: "Failed to delete statement" },
      { status: 500 },
    );
  }
}
