import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { loadImportDetail } from "@/lib/imports/importQueries";
import { postImport } from "@/lib/imports/postImport";
import { purchaseCostsIncludeVat } from "@/lib/purchasing/purchaseCostBasis";
import { importRoute, requireImportManager } from "@/lib/imports/importRoute";

export const maxDuration = 60;

const schema = z.object({ mode: z.enum(["normal", "historical"]) });

/** POST: post the import (or re-post it after a cost change). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return importRoute("POST /api/admin/imports/[id]/post", async () => {
    const user = await requireImportManager();
    const { id } = await params;
    const { mode } = schema.parse(await request.json());
    const costsIncludeVat: boolean = await purchaseCostsIncludeVat();
    await prisma.$transaction(
      (tx) => postImport(tx, { importId: id, mode, userId: user.id, costsIncludeVat }),
      { timeout: 55_000, maxWait: 10_000 },
    );
    return NextResponse.json(await loadImportDetail(prisma, id));
  });
}
