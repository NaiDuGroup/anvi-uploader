import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadImportDetail } from "@/lib/imports/importQueries";
import { unpostImport } from "@/lib/imports/postImport";
import { importRoute, requireImportManager } from "@/lib/imports/importRoute";

export const maxDuration = 60;

/** POST: take back the receipts of a «normal» posting. */
export async function POST(_r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return importRoute("POST /api/admin/imports/[id]/unpost", async () => {
    const user = await requireImportManager();
    const { id } = await params;
    await prisma.$transaction((tx) => unpostImport(tx, { importId: id, userId: user.id }), {
      timeout: 55_000,
      maxWait: 10_000,
    });
    return NextResponse.json(await loadImportDetail(prisma, id));
  });
}
