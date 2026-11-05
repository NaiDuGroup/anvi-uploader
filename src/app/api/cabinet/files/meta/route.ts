import { NextRequest, NextResponse } from "next/server";
import { CABINET_VISIBLE_ORDER_WHERE } from "@/lib/cabinetOrderScope";
import { z } from "zod";
import { getCustomerSessionUser } from "@/lib/auth";
import { loadFileMeta } from "@/lib/files/loadFileMeta";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(200) });

/**
 * Customer-facing twin of `/api/files/meta` (size · dpi · px · weight under a
 * file). Only files on the logged-in customer's own, non-deleted orders are
 * answered; other ids are silently left out.
 */
export async function POST(request: NextRequest) {
  const user = await getCustomerSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const meta = await loadFileMeta({
    id: { in: [...new Set(parsed.data.ids)] },
    order: { clientId: user.studioCustomerId!, ...CABINET_VISIBLE_ORDER_WHERE },
  });
  return NextResponse.json({ meta });
}
