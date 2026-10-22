import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roles";
import {
  applyVatCutover,
  previewVatCutover,
  VatCutoverAlreadyApplied,
} from "@/lib/accounting/vatCutover";
import { VAT_CUTOVER_CONFIRMATION } from "@/lib/accounting/vatBasis";

const applyBodySchema = z.object({
  convertProductionNorms: z.boolean(),
  /** Typed by the superadmin to avoid an accidental one-way switch. */
  confirm: z.literal(VAT_CUTOVER_CONFIRMATION),
});

async function authorize(): Promise<NextResponse | null> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden: superadmin only" }, { status: 403 });
  }
  return null;
}

/** What the ex-VAT switch would change (or when it was applied). */
export async function GET() {
  const denied = await authorize();
  if (denied) return denied;
  return NextResponse.json(await previewVatCutover());
}

/** One-way switch of purchase costs to the ex-VAT basis. */
export async function POST(request: NextRequest) {
  const denied = await authorize();
  if (denied) return denied;
  try {
    const body = applyBodySchema.parse(await request.json());
    const result = await applyVatCutover({ convertProductionNorms: body.convertProductionNorms });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof VatCutoverAlreadyApplied) {
      return NextResponse.json({ error: "already_applied" }, { status: 409 });
    }
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "validation_failed" }, { status: 400 });
    }
    console.error("vat cutover:", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
