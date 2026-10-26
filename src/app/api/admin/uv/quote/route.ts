import { NextRequest, NextResponse } from "next/server";
import { uvQuoteSchema } from "@/lib/uv/uvAdminSchemas";
import { readJsonBody, requireUvUser, UvAccess, uvRouteError } from "@/lib/uv/uvRoute";
import { resolveUvLine } from "@/lib/uv/resolveUvLine";

/** Price a UV line exactly as order creation will. */
export async function POST(request: NextRequest) {
  const user = await requireUvUser(UvAccess.Read);
  if (user instanceof NextResponse) return user;
  try {
    const body = uvQuoteSchema.parse(await readJsonBody(request));
    return NextResponse.json({ line: await resolveUvLine(body.uv, body.customerType) });
  } catch (error) {
    return uvRouteError(error, "quote");
  }
}
