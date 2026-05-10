import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCustomerSessionUser } from "@/lib/auth";
import {
  INVOICE_INCLUDE,
  toSerializableInvoice,
} from "@/lib/invoice/invoiceSerialization";

/**
 * Read-only invoice list for the customer cabinet. Drafts are intentionally
 * hidden — clients should never see an invoice that hasn't been issued.
 */
export async function GET() {
  const user = await getCustomerSessionUser();
  if (!user || !user.studioCustomerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const invoices = await prisma.invoice.findMany({
    where: {
      clientId: user.studioCustomerId,
      status: { in: ["ISSUED", "PAID", "CANCELLED"] },
    },
    orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
    include: INVOICE_INCLUDE,
  });
  return NextResponse.json({
    invoices: invoices.map(toSerializableInvoice),
  });
}
