import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { loadFileMeta } from "@/lib/files/loadFileMeta";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(200) });

/**
 * Weight, pixels, dpi and print size of uploaded files. Read from storage the
 * first time a file is asked for, then served from the database.
 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const meta = await loadFileMeta({ id: { in: [...new Set(parsed.data.ids)] } });
  return NextResponse.json({ meta });
}
