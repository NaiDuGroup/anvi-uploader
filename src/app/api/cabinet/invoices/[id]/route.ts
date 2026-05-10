import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCustomerSessionUser } from "@/lib/auth";
import {
  INVOICE_INCLUDE,
  toSerializableInvoice,
} from "@/lib/invoice/invoiceSerialization";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const user = await getCustomerSessionUser();
  if (!user || !user.studioCustomerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: INVOICE_INCLUDE,
  });
  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Customers may only see invoices that belong to them and were already
  // issued. DRAFT remains studio-only.
  if (
    invoice.clientId !== user.studioCustomerId ||
    invoice.status === "DRAFT"
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ invoice: toSerializableInvoice(invoice) });
}
