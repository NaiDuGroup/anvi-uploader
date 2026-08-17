import { parseLargeFormatLineData } from "@/lib/largeFormat/parseLargeFormatLineData";
import { lfMaterialFamilyKey } from "@/lib/largeFormat/lfMaterialFamily";
import { parseMugProductSnapshot } from "@/lib/mug/mugProductSnapshot";
import { parseNotebookProductSnapshot } from "@/lib/notebook/notebookProductSnapshot";
import { mugProductDisplayNameFromSnapshot } from "@/lib/mug/mugProductLabels";
import { notebookProductDisplayNameFromSnapshot } from "@/lib/notebook/notebookProductLabels";
import type { ProductType } from "@/lib/validations";
import { PRODUCT_TYPES } from "@/lib/validations";
import type {
  WorkshopBoardLine,
  WorkshopBoardGroup,
  WorkshopBoardSection,
  WorkshopBoardFile,
  LineFacts,
  WorkshopBoardAggregate,
} from "./types";
import { SECTION_ORDER } from "./types";

// ─── Raw input shape (from server enriched orders) ────────────────────────────

export interface RawOrderLine {
  id: string;
  sortOrder: number;
  productType: string;
  mugProductId: string | null;
  mugProductSnapshot: unknown;
  notebookProductId: string | null;
  notebookProductSnapshot: unknown;
  largeFormatLineData: unknown;
  files: WorkshopBoardFile[];
}

export interface RawOrder {
  id: string;
  orderNumber: number;
  phone: string;
  clientName: string | null;
  status: string;
  isPrio: boolean;
  unreadCommentCount: number;
  commentCount: number;
  createdAt: string;
  notes: string | null;
  orderLines: RawOrderLine[];
  /** Files at order level (legacy orders without `orderLines`) */
  files: WorkshopBoardFile[];
  mugProductSnapshot?: unknown;
  notebookProductSnapshot?: unknown;
  productType: string;
  createdByName: string | null;
  sentToWorkshopByName: string | null;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function isValidProductType(value: string): value is ProductType {
  return (PRODUCT_TYPES as readonly string[]).includes(value);
}

function extractLineFacts(line: RawOrderLine): LineFacts | null {
  const pt = line.productType;

  if (pt === "large_format_print") {
    const data = parseLargeFormatLineData(line.largeFormatLineData);
    if (!data) return null;
    const name = data.materialSnapshot?.name;
    if (typeof name !== "string" || name.trim() === "") return null;
    return {
      kind: "lf",
      data: {
        materialName: name.trim(),
        rollWidthMeters:
          typeof data.materialSnapshot?.rollWidthMeters === "string"
            ? data.materialSnapshot.rollWidthMeters
            : null,
        printableWidthMeters:
          typeof data.materialSnapshot?.printableWidthMeters === "string"
            ? data.materialSnapshot.printableWidthMeters
            : null,
        widthCm: data.printWidthCm,
        heightCm: data.printHeightCm,
        quantity: data.quantity,
        linearMeters: data.calculatedLinearMeters,
      },
    };
  }

  if (pt === "mug") {
    const snap = parseMugProductSnapshot(line.mugProductSnapshot);
    if (!snap) return null;
    const qty = line.files.reduce((s, f) => s + f.copies, 0);
    return {
      kind: "mug",
      data: {
        sku: snap.sku ?? "—",
        displayName: mugProductDisplayNameFromSnapshot(snap, "ru"),
        imageUrl: (snap as Record<string, unknown>).imageUrl as string | null,
        bodyColorHex: snap.bodyColorHex ?? null,
        handleColorHex: snap.handleColorHex ?? null,
        quantity: qty,
      },
    };
  }

  if (pt === "notebook") {
    const snap = parseNotebookProductSnapshot(line.notebookProductSnapshot);
    if (!snap) return null;
    const qty = line.files.reduce((s, f) => s + f.copies, 0);
    return {
      kind: "notebook",
      data: {
        sku: snap.sku ?? "—",
        displayName: notebookProductDisplayNameFromSnapshot(snap, "ru"),
        imageUrl: (snap as Record<string, unknown>).imageUrl as string | null,
        coverColorHex: snap.coverColorHex ?? null,
        paperKind: snap.paperKind ?? null,
        quantity: qty,
      },
    };
  }

  if (pt === "paper_print") {
    const qty = line.files.reduce((s, f) => s + f.copies, 0);
    const paperTypes = [...new Set(line.files.map((f) => f.paperType ?? ""))].filter(Boolean);
    const colors = [...new Set(line.files.map((f) => f.color))];
    return {
      kind: "paper",
      data: {
        paperType: paperTypes.length === 1 ? paperTypes[0] : "mixed",
        color: colors.length === 1 ? colors[0] : "mixed",
        quantity: qty,
      },
    };
  }

  return null;
}

function groupKey(facts: LineFacts): string {
  switch (facts.kind) {
    // LF lines group by material *family* (name without the roll-size token),
    // so ORACAL MATT 1.27 and 1.62 jobs land on one card and can share a layout.
    case "lf": return `lf::${lfMaterialFamilyKey(facts.data.materialName)}`;
    case "mug": return `mug::${facts.data.sku}`;
    case "notebook": return `nb::${facts.data.sku}`;
    case "paper": return `paper::${facts.data.paperType}::${facts.data.color}`;
  }
}

function groupLabel(facts: LineFacts): string {
  switch (facts.kind) {
    case "lf": return facts.data.materialName;
    case "mug": return facts.data.displayName;
    case "notebook": return facts.data.displayName;
    case "paper": return `${facts.data.paperType} · ${facts.data.color}`;
  }
}

function factsQty(facts: LineFacts): number {
  switch (facts.kind) {
    case "lf": return facts.data.quantity;
    case "mug": return facts.data.quantity;
    case "notebook": return facts.data.quantity;
    case "paper": return facts.data.quantity;
  }
}

function sectionSortKey(pt: ProductType): number {
  return SECTION_ORDER.indexOf(pt);
}

/** Sort lines within a group: prio → unread → status bucket → createdAt desc */
const STATUS_SORT_ORDER: Record<string, number> = {
  SENT_TO_WORKSHOP: 0,
  WORKSHOP_PRINTING: 1,
  WORKSHOP_READY: 2,
  RETURNED_TO_STUDIO: 3,
  DELIVERED: 4,
  ISSUE: 5,
  NEW: 6,
  IN_PROGRESS: 7,
  READY_IN_STUDIO: 8,
};

function sortLines(lines: WorkshopBoardLine[]): WorkshopBoardLine[] {
  return [...lines].sort((a, b) => {
    if (a.isPrio !== b.isPrio) return a.isPrio ? -1 : 1;
    const aUnread = a.unreadCommentCount > 0 ? 0 : 1;
    const bUnread = b.unreadCommentCount > 0 ? 0 : 1;
    if (aUnread !== bUnread) return aUnread - bUnread;
    const aSt = STATUS_SORT_ORDER[a.status] ?? 99;
    const bSt = STATUS_SORT_ORDER[b.status] ?? 99;
    if (aSt !== bSt) return aSt - bSt;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

/**
 * LF group label + meta derived from *all* lines of a family group:
 *  • label — the single material name when the whole group was ordered on one
 *    roll, else the family name (e.g. "ORACAL MATT");
 *  • rollWidthMeters / printableWidthMeters — taken from the widest ordered
 *    roll, so legacy consumers keep a width every tile is known to fit;
 *  • materialBreakdown — per-material line tally for the card badges.
 */
function buildLfGroupMeta(
  lines: WorkshopBoardLine[],
): { label: string | null; meta: WorkshopBoardGroup["meta"] } {
  const counts = new Map<string, number>();
  let widest: { rollWidthMeters: string | null; printableWidthMeters: string | null } | null = null;
  let widestRollM = -1;
  let familyKey = "";

  for (const line of lines) {
    if (line.facts.kind !== "lf") continue;
    const data = line.facts.data;
    counts.set(data.materialName, (counts.get(data.materialName) ?? 0) + 1);
    if (!familyKey) familyKey = lfMaterialFamilyKey(data.materialName);
    const rollM = Number(data.rollWidthMeters);
    const rollValue = Number.isFinite(rollM) ? rollM : 0;
    if (rollValue > widestRollM) {
      widestRollM = rollValue;
      widest = {
        rollWidthMeters: data.rollWidthMeters,
        printableWidthMeters: data.printableWidthMeters,
      };
    }
  }

  if (counts.size === 0) return { label: null, meta: {} };

  const materialBreakdown = [...counts.entries()]
    .map(([name, lineCount]) => ({ name, lineCount }))
    .sort((a, b) => b.lineCount - a.lineCount || a.name.localeCompare(b.name));

  return {
    label: counts.size === 1 ? materialBreakdown[0]!.name : familyKey,
    meta: {
      rollWidthMeters: widest?.rollWidthMeters ?? null,
      printableWidthMeters: widest?.printableWidthMeters ?? null,
      familyKey,
      materialBreakdown,
    },
  };
}

function makeAggregate(lines: WorkshopBoardLine[]): WorkshopBoardAggregate {
  const orderIds = new Set(lines.map((l) => l.orderId));
  const totalQty = lines.reduce((s, l) => s + factsQty(l.facts), 0);
  const hasLf = lines.every((l) => l.facts.kind === "lf");
  const totalLinearMeters = hasLf
    ? lines.reduce(
        (s, l) => s + (l.facts.kind === "lf" ? l.facts.data.linearMeters : 0),
        0,
      )
    : undefined;
  return {
    lineCount: lines.length,
    orderCount: orderIds.size,
    totalQty,
    ...(totalLinearMeters !== undefined ? { totalLinearMeters } : {}),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Pure grouping function: flat list of enriched orders → grouped board tree.
 *
 * Groups each `OrderLine` by `productType → material/SKU key`, then sorts
 * groups by descending line count (most work visible first) and lines within
 * each group by prio → unread → status → createdAt.
 */
export function groupLines(orders: RawOrder[]): WorkshopBoardSection[] {
  // Map: productType → groupKey → { lines, firstFacts }
  const sectionMap = new Map<
    ProductType,
    Map<string, { label: string; lines: WorkshopBoardLine[]; firstFacts: LineFacts }>
  >();

  for (const order of orders) {
    // Resolve the list of lines to iterate
    const rawLines: RawOrderLine[] =
      order.orderLines && order.orderLines.length > 0
        ? order.orderLines.map((line) => ({
            ...line,
            files: order.files.filter((f) => f.orderLineId === line.id),
          }))
        : [
            // Legacy single-line order
            {
              id: "legacy",
              sortOrder: 0,
              productType: order.productType,
              mugProductSnapshot: order.mugProductSnapshot ?? null,
              notebookProductSnapshot: order.notebookProductSnapshot ?? null,
              mugProductId: null,
              notebookProductId: null,
              largeFormatLineData: null,
              files: order.files,
            },
          ];

    const totalLines = rawLines.length;

    rawLines.forEach((rawLine, idx) => {
      if (!isValidProductType(rawLine.productType)) return;
      const pt = rawLine.productType as ProductType;

      const facts = extractLineFacts(rawLine);
      if (!facts) return;

      const key = groupKey(facts);
      const label = groupLabel(facts);

      if (!sectionMap.has(pt)) {
        sectionMap.set(pt, new Map());
      }
      const groupMap = sectionMap.get(pt)!;

      if (!groupMap.has(key)) {
        groupMap.set(key, { label, lines: [], firstFacts: facts });
      }

      const boardLine: WorkshopBoardLine = {
        uid: `${order.id}::${rawLine.id}`,
        orderId: order.id,
        orderLineId: rawLine.id,
        orderNumber: order.orderNumber,
        lineIndex: idx + 1,
        totalLines,
        phone: order.phone,
        clientName: order.clientName,
        status: order.status,
        isPrio: order.isPrio,
        unreadCommentCount: order.unreadCommentCount,
        commentCount: order.commentCount,
        createdAt: order.createdAt,
        productType: pt,
        facts,
        files: rawLine.files,
        notes: order.notes,
        createdByName: order.createdByName,
        sentToWorkshopByName: order.sentToWorkshopByName,
      };

      groupMap.get(key)!.lines.push(boardLine);
    });
  }

  const sections: WorkshopBoardSection[] = [];

  for (const [pt, groupMap] of sectionMap.entries()) {
    const groups: WorkshopBoardGroup[] = [];

    for (const [key, { label, lines, firstFacts }] of groupMap.entries()) {
      const sorted = sortLines(lines);
      const aggregate = makeAggregate(sorted);

      let meta: WorkshopBoardGroup["meta"] = {};
      let resolvedLabel = label;
      if (firstFacts.kind === "lf") {
        const lf = buildLfGroupMeta(sorted);
        meta = lf.meta;
        if (lf.label) resolvedLabel = lf.label;
      } else if (firstFacts.kind === "mug") {
        meta.bodyColorHex = firstFacts.data.bodyColorHex;
        meta.handleColorHex = firstFacts.data.handleColorHex;
      } else if (firstFacts.kind === "notebook") {
        meta.coverColorHex = firstFacts.data.coverColorHex;
      }

      groups.push({ key, label: resolvedLabel, aggregate, lines: sorted, meta });
    }

    // Sort groups: most lines first; tie-break by totalQty desc
    groups.sort((a, b) => {
      if (b.aggregate.lineCount !== a.aggregate.lineCount) {
        return b.aggregate.lineCount - a.aggregate.lineCount;
      }
      const aLm = a.aggregate.totalLinearMeters ?? a.aggregate.totalQty;
      const bLm = b.aggregate.totalLinearMeters ?? b.aggregate.totalQty;
      return bLm - aLm;
    });

    const allLines = groups.flatMap((g) => g.lines);
    const totals = makeAggregate(allLines);

    sections.push({ productType: pt, groups, totals });
  }

  // Sort sections in canonical order
  sections.sort((a, b) => sectionSortKey(a.productType) - sectionSortKey(b.productType));

  return sections;
}
