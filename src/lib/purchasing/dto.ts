import { z } from "zod";
import {
  PurchaseInvoiceStatus,
  PurchaseLineStatus,
  StockTargetKind,
  type PostableStockTargetKind,
  type StockTargetOption,
} from "./types";

/** Shapes shared by the purchase-invoice API routes and the admin UI. */

export type PurchaseLineCounts = Record<PurchaseLineStatus, number>;

export type PurchaseInvoiceListItem = {
  id: string;
  seria: string;
  number: string;
  eFacturaStatus: number;
  supplierName: string | null;
  supplierIdno: string | null;
  issueDate: string | null;
  deliveryDate: string | null;
  totalExVat: number | null;
  totalAmount: number | null;
  status: PurchaseInvoiceStatus;
  lineCounts: PurchaseLineCounts;
};

export type PurchaseSyncResult = {
  skipped: "efactura_mock" | null;
  discovered: number;
  imported: number;
  autoPosted: number;
  autoIgnored: number;
  needsReview: number;
  remainingDetails: number;
  /** Invoices whose XML could not be fetched or stored this run (retried next run). */
  failedDetails: number;
};

export enum PurchaseSyncFailure {
  DatabaseSchemaOutdated = "database_schema_outdated",
  EFacturaUnavailable = "efactura_unavailable",
  Unknown = "unknown",
}

/** Body of a failed `POST /api/admin/purchase-invoices`. */
export type PurchaseSyncErrorResponse = {
  error: "sync_failed";
  reason: PurchaseSyncFailure;
  detail: string;
};

export type PurchaseInvoiceListResponse = {
  invoices: PurchaseInvoiceListItem[];
  /** Invoices with at least one line still waiting for a decision. */
  openInvoiceCount: number;
  openLineCount: number;
  lastSyncedAt: string | null;
  live: boolean;
};

export enum SuggestionSource {
  Mapping = "mapping",
  Similarity = "similarity",
}

export type LineSuggestion = {
  source: SuggestionSource;
  kind: StockTargetKind;
  targetId: string | null;
  targetName: string | null;
  unitsPerInvoiceUnit: number;
  /** Similarity score (0..1.5) for name-based guesses; null for remembered rules. */
  score: number | null;
  confirmedCount: number;
  /** Price differs by more than the auto-post tolerance from the last invoice. */
  priceDrift: boolean;
};

export type PostedLineInfo = {
  kind: StockTargetKind;
  targetId: string | null;
  targetName: string | null;
  quantity: number;
  costMdl: number;
  auto: boolean;
  postedAt: string;
};

export type LinkableReceiptDto = {
  id: string;
  quantity: number;
  totalCostMdl: number;
  purchasedAt: string;
  isProvisional: boolean;
};

/** Hand-entered receipts of the suggested item that this line may be the invoice for. */
export type LinkCandidates = {
  kind: StockTargetKind;
  targetId: string;
  receipts: LinkableReceiptDto[];
};

export type PurchaseLineDto = {
  id: string;
  position: number;
  name: string;
  unit: string | null;
  quantity: number;
  unitPriceExVat: number | null;
  totalExVat: number;
  vatAmount: number | null;
  total: number;
  status: PurchaseLineStatus;
  posted: PostedLineInfo | null;
  suggestions: LineSuggestion[];
  /** Pre-filled «our units per invoice unit» per stock kind, parsed from the name. */
  suggestedFactors: Record<PostableStockTargetKind, number>;
  linkCandidates: LinkCandidates | null;
};

export type PurchaseInvoiceDetailResponse = {
  invoice: PurchaseInvoiceListItem;
  lines: PurchaseLineDto[];
  targets: StockTargetOption[];
  /** Receipt cost basis: true = with VAT (legacy), false = ex-VAT. */
  costsIncludeVat: boolean;
};

export const postLineBodySchema = z
  .object({
    kind: z.nativeEnum(StockTargetKind),
    targetId: z.string().min(1).max(100).nullable(),
    unitsPerInvoiceUnit: z.number().positive().max(1_000_000),
    /** Link an existing hand-entered receipt instead of posting a new one. */
    linkReceiptId: z.string().min(1).max(100).nullable().optional(),
  })
  .refine((b) => b.kind === StockTargetKind.Ignore || b.targetId !== null, {
    message: "targetId is required",
    path: ["targetId"],
  });

export type PostLineBody = z.infer<typeof postLineBodySchema>;

export type SupplierMappingDto = {
  id: string;
  supplierIdno: string;
  supplierName: string | null;
  sampleName: string;
  targetKind: StockTargetKind;
  targetId: string | null;
  targetName: string | null;
  unitsPerInvoiceUnit: number;
  confirmedCount: number;
  autoPosts: boolean;
  lastUnitPriceExVat: number | null;
  lastSeenAt: string | null;
};

export const updateMappingBodySchema = z.object({
  targetKind: z.nativeEnum(StockTargetKind).optional(),
  targetId: z.string().min(1).max(100).nullable().optional(),
  unitsPerInvoiceUnit: z.number().positive().max(1_000_000).optional(),
  /** Turn automatic posting on (trust now) or off (back to manual). */
  autoPost: z.boolean().optional(),
});

export type UpdateMappingBody = z.infer<typeof updateMappingBodySchema>;
