import type { Invoice, InvoiceLineItem, Prisma } from "@prisma/client";
import type { InvoiceLocale, InvoiceStatus } from "@/lib/validations";

/** Frozen-at-issue supplier info (subset of CompanyProfile). */
export interface InvoiceSupplierSnapshot {
  name: string;
  fiscalCode: string;
  address: string;
  iban: string;
  bankName: string;
  bic: string;
  directorName: string | null;
  accountantName: string | null;
  logoPath: string | null;
}

/** Frozen-at-issue payer info (subset of StudioCustomer). */
export interface InvoiceClientSnapshot {
  kind: "INDIVIDUAL" | "LEGAL";
  personName: string | null;
  companyName: string | null;
  companyIdno: string | null;
  companyIban: string | null;
  phone: string | null;
  email: string | null;
}

export interface SerializedInvoiceLine {
  id: string;
  position: number;
  description: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  vatAmount: string;
  orderId: string | null;
  orderNumber: number | null;
}

export interface SerializedInvoice {
  id: string;
  number: string | null;
  sequenceNumber: number | null;
  status: InvoiceStatus;
  locale: InvoiceLocale;
  currency: string;
  issueDate: string;
  validUntil: string;
  vatRate: string;
  vatInclusive: boolean;
  subtotal: string;
  vatAmount: string;
  totalAmount: string;
  notes: string | null;
  paidAt: string | null;
  paidNote: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
  client: {
    id: string;
    kind: string;
    displayName: string;
    companyName: string | null;
    personName: string | null;
    phone: string | null;
    companyIdno: string | null;
    companyIban: string | null;
  };
  /** Always present on issued/+ invoices; null on drafts. */
  supplierSnapshot: InvoiceSupplierSnapshot | null;
  clientSnapshot: InvoiceClientSnapshot | null;
  /** User who created the invoice. Null only for very old rows without createdById. */
  createdBy: {
    id: string;
    name: string;
  } | null;
  lineItems: SerializedInvoiceLine[];
  isExpired: boolean;
}

type LineWithOrder = InvoiceLineItem & {
  order: { id: string; orderNumber: number } | null;
};

type InvoiceWithRelations = Invoice & {
  lineItems: LineWithOrder[];
  client: {
    id: string;
    kind: string;
    companyName: string | null;
    personName: string | null;
    phone: string | null;
    companyIdno: string | null;
    companyIban: string | null;
  };
  createdBy: { id: string; name: string } | null;
};

const decimalToString = (d: Prisma.Decimal | number | string): string =>
  typeof d === "string" ? d : d.toString();

function clientDisplayName(c: InvoiceWithRelations["client"]): string {
  return (
    c.companyName?.trim() ||
    c.personName?.trim() ||
    c.phone?.trim() ||
    "(client)"
  );
}

export function isInvoiceExpired(inv: Invoice): boolean {
  if (inv.status !== "ISSUED") return false;
  return inv.validUntil.getTime() < Date.now();
}

export function toSerializableInvoice(
  inv: InvoiceWithRelations,
): SerializedInvoice {
  return {
    id: inv.id,
    number: inv.number ?? null,
    sequenceNumber: inv.sequenceNumber ?? null,
    status: inv.status as InvoiceStatus,
    locale: inv.locale as InvoiceLocale,
    currency: inv.currency,
    issueDate: inv.issueDate.toISOString(),
    validUntil: inv.validUntil.toISOString(),
    vatRate: decimalToString(inv.vatRate),
    vatInclusive: inv.vatInclusive,
    subtotal: decimalToString(inv.subtotal),
    vatAmount: decimalToString(inv.vatAmount),
    totalAmount: decimalToString(inv.totalAmount),
    notes: inv.notes ?? null,
    paidAt: inv.paidAt ? inv.paidAt.toISOString() : null,
    paidNote: inv.paidNote ?? null,
    cancelledAt: inv.cancelledAt ? inv.cancelledAt.toISOString() : null,
    cancelReason: inv.cancelReason ?? null,
    createdAt: inv.createdAt.toISOString(),
    updatedAt: inv.updatedAt.toISOString(),
    client: {
      id: inv.client.id,
      kind: inv.client.kind,
      displayName: clientDisplayName(inv.client),
      companyName: inv.client.companyName,
      personName: inv.client.personName,
      phone: inv.client.phone,
      companyIdno: inv.client.companyIdno,
      companyIban: inv.client.companyIban,
    },
    supplierSnapshot:
      (inv.supplierSnapshot as InvoiceSupplierSnapshot | null) ?? null,
    clientSnapshot:
      (inv.clientSnapshot as InvoiceClientSnapshot | null) ?? null,
    createdBy: inv.createdBy
      ? { id: inv.createdBy.id, name: inv.createdBy.name }
      : null,
    lineItems: inv.lineItems
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((li) => ({
        id: li.id,
        position: li.position,
        description: li.description,
        unit: li.unit,
        quantity: decimalToString(li.quantity),
        unitPrice: decimalToString(li.unitPrice),
        lineTotal: decimalToString(li.lineTotal),
        vatAmount: decimalToString(li.vatAmount),
        orderId: li.orderId ?? null,
        orderNumber: li.order?.orderNumber ?? null,
      })),
    isExpired: isInvoiceExpired(inv),
  };
}

/** Prisma `include` reused across all invoice routes. */
export const INVOICE_INCLUDE = {
  client: {
    select: {
      id: true,
      kind: true,
      companyName: true,
      personName: true,
      phone: true,
      companyIdno: true,
      companyIban: true,
    },
  },
  createdBy: {
    select: { id: true, name: true },
  },
  lineItems: {
    include: {
      order: { select: { id: true, orderNumber: true } },
    },
    orderBy: { position: "asc" as const },
  },
} as const;
