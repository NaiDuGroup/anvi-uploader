import { NextRequest, NextResponse } from "next/server";
import { sublimationQuoteSchema } from "@/lib/sublimation/sublimationAdminSchemas";
import {
  readJsonBody,
  requireSublimationUser,
  SublimationAccess,
  sublimationRouteError,
} from "@/lib/sublimation/sublimationRoute";
import { resolveSublimationLine } from "@/lib/sublimation/resolveSublimationLine";

/** Price a sublimation line exactly as order creation will. */
export async function POST(request: NextRequest) {
  const user = await requireSublimationUser(SublimationAccess.Read);
  if (user instanceof NextResponse) return user;
  try {
    const body = sublimationQuoteSchema.parse(await readJsonBody(request));
    return NextResponse.json({ line: await resolveSublimationLine(body.sublimation, body.customerType) });
  } catch (error) {
    return sublimationRouteError(error, "quote");
  }
}
