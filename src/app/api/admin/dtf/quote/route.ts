import { NextRequest, NextResponse } from "next/server";
import { dtfQuoteSchema } from "@/lib/dtf/dtfAdminSchemas";
import { DtfAccess, dtfRouteError, readJsonBody, requireDtfUser } from "@/lib/dtf/dtfRoute";
import { resolveDtfLine } from "@/lib/dtf/resolveDtfLine";

/** Price a DTF line exactly as order creation will. */
export async function POST(request: NextRequest) {
  const user = await requireDtfUser(DtfAccess.Read);
  if (user instanceof NextResponse) return user;
  try {
    const body = dtfQuoteSchema.parse(await readJsonBody(request));
    return NextResponse.json({ line: await resolveDtfLine(body.dtf, body.customerType) });
  } catch (error) {
    return dtfRouteError(error, "quote");
  }
}
