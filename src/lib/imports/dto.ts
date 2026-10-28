import type { ImportCosting } from "./landedCost";
import type { ItemProposal } from "./gorFactoryProposals";
import type { PrintMethod } from "@/lib/stock/unified/printMethods";
import type { RequiredImportDocument } from "./constants";

/** Row of «Склад → Импорт». */
export interface ImportListItemJson {
  id: string;
  supplierName: string;
  supplierOrderNo: string | null;
  proformaNo: string | null;
  orderedAt: string | null;
  status: string;
  postedMode: string | null;
  currency: string;
  goodsAmount: number;
  totalCostsMdl: number;
  linesCount: number;
  piecesCount: number;
  missingDocuments: RequiredImportDocument[];
  provisional: boolean;
}

export interface ImportDocumentJson {
  id: string;
  kind: string;
  fileName: string;
  contentType: string | null;
  sizeBytes: number | null;
  note: string | null;
  createdAt: string;
}

export interface ImportCostJson {
  id: string;
  kind: string;
  amountMdl: number;
  isProvisional: boolean;
  excluded: boolean;
  note: string | null;
}

export interface ImportLineJson {
  id: string;
  position: number;
  supplierCode: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  skip: boolean;
  variant: {
    id: string;
    sku: string;
    name: string;
    label: string | null;
    categoryName: string;
    imageUrl: string | null;
    stockQuantity: number;
    unitCostMdl: number | null;
  } | null;
  receiptId: string | null;
  postedUnitCostMdl: number | null;
  /** Supplier photo (static.gorfactory.es) when the code follows its pattern. */
  supplierImageUrl: string | null;
}

export interface ImportDetailJson {
  id: string;
  supplierName: string;
  supplierOrderNo: string | null;
  proformaNo: string | null;
  brokerName: string | null;
  declarationNo: string | null;
  trackingNo: string | null;
  currency: string;
  orderedAt: string | null;
  arrivedAt: string | null;
  status: string;
  notes: string | null;
  relatedImport: { id: string; label: string } | null;
  postedMode: string | null;
  postedAt: string | null;
  documents: ImportDocumentJson[];
  costs: ImportCostJson[];
  lines: ImportLineJson[];
  costing: ImportCosting;
  missingDocuments: RequiredImportDocument[];
}

export interface ImportProposalCategoryJson {
  id: string;
  code: string;
  nameRu: string;
  nameRo: string;
  nameEn: string;
  printMethods: PrintMethod[];
}

export interface ImportProposalJson extends ItemProposal {
  photoUrl: string | null;
  /** Pieces over all lines of the item. */
  quantity: number;
}

export interface ImportProposalsJson {
  categories: ImportProposalCategoryJson[];
  proposals: ImportProposalJson[];
}
