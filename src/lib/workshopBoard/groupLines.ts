import { stickerPreviewFromLineData, stickerSheetSummaryRu } from "@/lib/stickerSheet/stickerSheet";
import { postcardPreviewFromLineData, postcardStepsRu, postcardSummaryRu } from "@/lib/postcard/postcard";
import { lfLineExtrasRu } from "@/lib/largeFormat/lfLineSummaryLabel";
import { parseLargeFormatLineData } from "@/lib/largeFormat/parseLargeFormatLineData";
import {
  businessCardTrimSize,
  parseBusinessCardLineData,
} from "@/lib/businessCard/parseBusinessCardLineData";
import {
  isSheetProductType,
  sheetPaperDisplayName,
} from "@/lib/sheetProduct/sheetProductConfig";
import { lfMaterialFamilyKey } from "@/lib/largeFormat/lfMaterialFamily";
import { parseMugProductSnapshot } from "@/lib/mug/mugProductSnapshot";
import { parseNotebookProductSnapshot } from "@/lib/notebook/notebookProductSnapshot";
import { parsePenProductSnapshot } from "@/lib/pen/penProductSnapshot";
import { mugProductDisplayNameFromSnapshot } from "@/lib/mug/mugProductLabels";
import { notebookProductDisplayNameFromSnapshot } from "@/lib/notebook/notebookProductLabels";
import { penProductDisplayNameFromSnapshot } from "@/lib/pen/penProductLabels";
import type { ProductType } from "@/lib/validations";
import { PRODUCT_TYPES } from "@/lib/validations";
import { dtfZoneIdFromPaperType } from "@/lib/dtf/dtfConstants";
import { DEFAULT_DTF_SETTINGS } from "@/lib/dtf/dtfSettings";
import { parseDtfLineData } from "@/lib/dtf/parseDtfLineData";
import type { DtfLineData } from "@/lib/dtf/types";
import { parseUvLineData } from "@/lib/uv/parseUvLineData";
import { uvItemDisplayName } from "@/lib/uv/stockItems";
import { uvZoneIdFromPaperType } from "@/lib/uv/uvConstants";
import type { UvLineData } from "@/lib/uv/types";
import { parseSublimationLineData } from "@/lib/sublimation/parseSublimationLineData";
import { sublimationItemDisplayName } from "@/lib/sublimation/stockItems";
import type {
  WorkshopBoardLine,
  WorkshopBoardGroup,
  WorkshopBoardSection,
  BoardSectionKey,
  WorkshopBoardFile,
  LineFacts,
  WorkshopBoardAggregate,
  DtfFilmSpec,
  DtfLineFacts,
  UvLineFacts,
  SublimationLineFacts,
} from "./types";
import { SECTION_ORDER } from "./types";
import { giftSetBadgeLabel, giftSetPackNote, isLegacyReadySetLine, parseOrderLineSetData } from "@/lib/giftSet/giftSet";
import { paperLineLabelRu } from "./paperLineLabel";
import { lineStatusForOrderStatus } from "@/lib/orderLineProductionStatus";
import { boardLineStatus } from "@/lib/orderStatusFromLines";
import { layoutAttentionRank } from "@/lib/layoutIssue";

// ─── Raw input shape (from server enriched orders) ────────────────────────────

export interface RawOrderLine {
  id: string;
  sortOrder: number;
  productType: string;
  mugProductSnapshot: unknown;
  notebookProductSnapshot: unknown;
  /** Unified «Ручки» variant of a pen line (display reads the frozen snapshot). */
  stockVariantId?: string | null;
  penProductSnapshot: unknown;
  largeFormatLineData: unknown;
  businessCardLineData?: unknown;
  dtfLineData?: unknown;
  uvLineData?: unknown;
  sublimationLineData?: unknown;
  /** Storefront cart line (`OrderLine.shopLineData`): names a print-shop paper product. */
  shopLineData?: unknown;
  /** «Набор» (`OrderLine.setData`): badge on the card. */
  setData?: unknown;
  /** «Набор»: pack note + «Закупка» of the line's set (`giftSet/giftSetBoard.ts`). */
  giftSetFlags?: { packNote: string | null; procurement: boolean } | null;
  /** `OrderLine.productionStatus`; absent → the order status's line status (legacy rows). */
  productionStatus?: string;
  /** «Нужен макет» details (`src/lib/layoutIssue.ts`). */
  layoutIssueReason?: string | null;
  layoutIssueNote?: string | null;
  layoutIssueAt?: string | null;
  layoutFixedAt?: string | null;
  ownerReplacedAt?: string | null;
  ownerReplacedRole?: string | null;
  files: WorkshopBoardFile[];
}

export interface RawOrder {
  id: string;
  orderNumber: number;
  phone: string;
  clientName: string | null;
  status: string;
  isPrio: boolean;
  /** Last dealer edit from the cabinet (ISO), if any. */
  dealerEditedAt?: string | null;
  /** Dealer urgency request (fee + waived), if any. */
  dealerUrgency?: { feeMdl: number; waived: boolean } | null;
  unreadCommentCount: number;
  commentCount: number;
  createdAt: string;
  notes: string | null;
  orderLines: RawOrderLine[];
  /** Files at order level (legacy orders without `orderLines`) */
  files: WorkshopBoardFile[];
  mugProductSnapshot?: unknown;
  notebookProductSnapshot?: unknown;
  penProductSnapshot?: unknown;
  productType: string;
  createdByName: string | null;
  sentToWorkshopByName: string | null;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** «Набор: Ручка + блокнот + кружка ×3» + the component («Ручка») of a set line; null outside a set. */
function giftSetBoardBadge(
  raw: unknown,
  flags: RawOrderLine["giftSetFlags"],
): WorkshopBoardLine["giftSet"] {
  const d = parseOrderLineSetData(raw);
  if (!d) return null;
  return {
    label: giftSetBadgeLabel(d),
    role: isLegacyReadySetLine(d) ? null : d.roleLabel,
    quantity: d.quantity,
    packNote: flags?.packNote ?? giftSetPackNote(d.kind, d.boxSku),
    procurement: flags?.procurement === true,
  };
}

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
        ...(lfLineExtrasRu(data) ? { extrasRu: lfLineExtrasRu(data)! } : {}),
      },
    };
  }

  if (isSheetProductType(pt)) {
    const data = parseBusinessCardLineData(line.businessCardLineData);
    if (!data) return null;
    const trim = businessCardTrimSize(data);
    return {
      kind: "sheet_product",
      data: {
        paperName: sheetPaperDisplayName(data.paperSnapshot),
        sheetWidthCm: data.postcard?.sheetWidthCm ?? data.paperSnapshot.sheetWidthCm,
        sheetHeightCm: data.postcard?.sheetHeightCm ?? data.paperSnapshot.sheetHeightCm,
        cardWidthCm: data.cardWidthCm,
        cardHeightCm: data.cardHeightCm,
        cardTrimWidthCm: trim.widthCm,
        cardTrimHeightCm: trim.heightCm,
        quantity: data.quantity,
        cardsPerSheet: data.cardsPerSheet,
        sheetsUsed: data.sheetsUsed,
        sides: data.sides,
        ...(sheetFinishingRu(data) ? { finishingRu: sheetFinishingRu(data)! } : {}),
        ...(data.stickerSheet && stickerPreviewFromLineData(data)
          ? {
              sticker: {
                ...stickerPreviewFromLineData(data)!,
                summaryRu: stickerSheetSummaryRu(data.stickerSheet),
              },
            }
          : {}),
        ...(data.postcard && postcardPreviewFromLineData(data)
          ? {
              postcard: {
                summaryRu: postcardSummaryRu(data),
                stepsRu: postcardStepsRu(data),
                preview: postcardPreviewFromLineData(data)!,
              },
            }
          : {}),
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

  if (pt === "pen") {
    const snap = parsePenProductSnapshot(line.penProductSnapshot);
    if (!snap) return null;
    const qty = line.files.reduce((s, f) => s + f.copies, 0);
    return {
      kind: "pen",
      data: {
        sku: snap.sku,
        displayName: penProductDisplayNameFromSnapshot(snap, "ru"),
        bodyColorHex: snap.bodyColorHex,
        clipColorHex: snap.clipColorHex,
        quantity: qty,
      },
    };
  }

  if (pt === "dtf_apparel") {
    const data = parseDtfLineData(line.dtfLineData);
    if (!data) return null;
    return { kind: "dtf", data: dtfLineFacts(data, line.files) };
  }

  if (pt === "uv_print") {
    const data = parseUvLineData(line.uvLineData);
    if (!data) return null;
    const facts = uvLineFacts(data, line.files);
    // «Набор» C: the thermos is the set's (written off by the set), not a client item.
    const set = parseOrderLineSetData(line.setData);
    if (set?.kind === "ready" && set.zoneId && data.source === "client") facts.giftSetItem = true;
    return { kind: "uv", data: facts };
  }

  if (pt === "sublimation_print") {
    const data = parseSublimationLineData(line.sublimationLineData);
    if (!data) return null;
    const item = data.item;
    const client = item ? null : (data.clientItem ?? null);
    const facts: SublimationLineFacts = {
      source: item ? "stock" : "client",
      variantId: item?.variantId ?? null,
      itemName: item ? sublimationItemDisplayName(item, "ru") : `изделие клиента: ${client?.description ?? "—"}`,
      sku: item?.sku ?? null,
      colorHex: item?.colorHex ?? null,
      categoryCode: item?.categoryCode ?? null,
      sizeLabel: client ? `${client.widthCm}×${client.heightCm} см` : null,
      clientItemNotes: client?.notes ?? null,
      quantity: data.quantity,
      fileCount: line.files.length,
    };
    return { kind: "sublimation", data: facts };
  }

  if (pt === "paper_print") {
    const qty = line.files.reduce((s, f) => s + f.copies, 0);
    const paperTypes = [...new Set(line.files.map((f) => f.paperType ?? ""))].filter(Boolean);
    const colors = [...new Set(line.files.map((f) => f.color))];
    const paperType = paperTypes.length === 1 ? paperTypes[0] : "mixed";
    return {
      kind: "paper",
      data: {
        paperType,
        label: paperLineLabelRu(paperType, line.shopLineData),
        color: colors.length === 1 ? colors[0] : "mixed",
        quantity: qty,
      },
    };
  }

  return null;
}

const DTF_GROUP_KEY = "dtf::film";
const DTF_GROUP_LABEL = "DTF";

const DEFAULT_DTF_FILM: DtfFilmSpec = {
  printableWidthCm: DEFAULT_DTF_SETTINGS.printableWidthCm,
  gapCm: DEFAULT_DTF_SETTINGS.gapCm,
};

function dtfLineFacts(data: DtfLineData, files: readonly WorkshopBoardFile[]): DtfLineFacts {
  const fileIdByZone = new Map<string, string>();
  for (const f of files) {
    const zoneId: string | null = dtfZoneIdFromPaperType(f.paperType);
    if (zoneId && !fileIdByZone.has(zoneId)) fileIdByZone.set(zoneId, f.id);
  }
  return {
    garmentSource: data.garmentSource,
    garmentKind: data.garment?.kind ?? null,
    garmentName: data.garment?.name ?? null,
    garmentNames: data.garment?.names ?? null,
    colorName: data.garment?.colorName ?? null,
    colorHex: data.garment?.colorHex ?? null,
    quantity: data.quantity,
    sizes: data.sizes.map((s) => ({ size: s.size, quantity: s.quantity })),
    transfers: data.zones.map((z) => ({
      zoneId: z.id,
      placement: z.placement,
      ...(z.placementNote ? { placementNote: z.placementNote } : {}),
      presetLabel: z.presetLabel,
      customSize: z.customSize,
      widthCm: z.widthCm,
      heightCm: z.heightCm,
      fileId: fileIdByZone.get(z.id) ?? null,
      ...(z.noPress ? { noPress: true } : {}),
    })),
    filmLinearMeters: data.consumption.filmLinearMeters,
  };
}

const UV_CLIENT_GROUP_KEY = "uv::client";
const UV_CLIENT_GROUP_LABEL = "UV · изделия клиента";
const UV_DTF_CLIENT_GROUP_KEY = "uvdtf::client";
const UV_DTF_CLIENT_GROUP_LABEL = "UV-DTF · изделия клиента";
/** Plain UV-DTF stickers (menu «UV-DTF наклейки»): no item, one shared card. */
const UV_DTF_STICKERS_GROUP_KEY = "uvdtf::stickers";
const UV_DTF_STICKERS_GROUP_LABEL = "UV-DTF · наклейки";
const SUBLIMATION_CLIENT_GROUP_KEY = "subl::client";
const SUBLIMATION_CLIENT_GROUP_LABEL = "Сублимация · изделия клиента";

function uvLineFacts(data: UvLineData, files: readonly WorkshopBoardFile[]): UvLineFacts {
  const fileIdByZone = new Map<string, string>();
  for (const f of files) {
    const zoneId: string | null = uvZoneIdFromPaperType(f.paperType);
    if (zoneId && !fileIdByZone.has(zoneId)) fileIdByZone.set(zoneId, f.id);
  }
  return {
    source: data.source,
    variantId: data.item?.variantId ?? null,
    itemName: data.item ? uvItemDisplayName(data.item, "ru") : null,
    sku: data.item?.sku ?? null,
    colorHex: data.item?.colorHex ?? null,
    clientItemDescription: data.clientItem?.description ?? null,
    clientItemNotes: data.clientItem?.notes ?? null,
    quantity: data.quantity,
    ...(data.technique === "transfer"
      ? { transfer: true, filmMeters: data.consumption.filmMeters ?? 0 }
      : {}),
    zones: data.zones.map((z) => ({
      zoneId: z.id,
      placement: z.placement,
      placementLabel: z.placementLabel,
      customSize: z.customSize,
      widthCm: z.widthCm,
      heightCm: z.heightCm,
      whiteLayers: z.whiteLayers,
      varnish: z.varnish,
      primer: z.primer === true,
      fileId: fileIdByZone.get(z.id) ?? null,
    })),
  };
}

function groupKey(facts: LineFacts): string {
  switch (facts.kind) {
    // LF lines group by material *family* (name without the roll-size token),
    // so ORACAL MATT 1.27 and 1.62 jobs land on one card and can share a layout.
    case "lf": return `lf::${lfMaterialFamilyKey(facts.data.materialName)}`;
    // Same paper and the same number of passes print together.
    case "sheet_product": return `sheet::${facts.data.paperName}::${facts.data.sides}`;
    case "mug": return `mug::${facts.data.sku}`;
    case "notebook": return `nb::${facts.data.sku}`;
    case "pen": return `pen::${facts.data.sku}`;
    // Every DTF job prints on the same film, so they share one card and one layout.
    case "dtf": return DTF_GROUP_KEY;
    // Stock items of one variant print together; client items share one card.
    // UV-DTF stickers are printed on film, apart from direct UV on the item.
    case "uv":
      if (facts.data.transfer) {
        if (facts.data.variantId) return `uvdtf::${facts.data.variantId}`;
        return facts.data.source === "stickers" ? UV_DTF_STICKERS_GROUP_KEY : UV_DTF_CLIENT_GROUP_KEY;
      }
      if (facts.data.giftSetItem) return `uv::set::${facts.data.clientItemDescription ?? ""}`;
      return facts.data.variantId ? `uv::${facts.data.variantId}` : UV_CLIENT_GROUP_KEY;
    // Blanks of one variant print and press together; client items share one card.
    case "sublimation": return facts.data.variantId ? `subl::${facts.data.variantId}` : SUBLIMATION_CLIENT_GROUP_KEY;
    // A storefront product (desk calendar) does not share a card with plain prints of its format.
    case "paper": return `paper::${facts.data.label}::${facts.data.color}`;
  }
}

function groupLabel(facts: LineFacts): string {
  switch (facts.kind) {
    case "lf": return facts.data.materialName;
    case "sheet_product": return facts.data.paperName;
    case "mug": return facts.data.displayName;
    case "notebook": return facts.data.displayName;
    case "pen": return facts.data.displayName;
    case "dtf": return DTF_GROUP_LABEL;
    case "uv":
      if (facts.data.transfer) {
        if (facts.data.itemName) return `UV-DTF · ${facts.data.itemName}`;
        return facts.data.source === "stickers" ? UV_DTF_STICKERS_GROUP_LABEL : UV_DTF_CLIENT_GROUP_LABEL;
      }
      if (facts.data.giftSetItem) return `UV · ${facts.data.clientItemDescription ?? "—"}`;
      return facts.data.itemName ? `UV · ${facts.data.itemName}` : UV_CLIENT_GROUP_LABEL;
    case "sublimation":
      return facts.data.variantId ? `Сублимация · ${facts.data.itemName}` : SUBLIMATION_CLIENT_GROUP_LABEL;
    case "paper": return `${facts.data.label} · ${facts.data.color}`;
  }
}

function factsQty(facts: LineFacts): number {
  switch (facts.kind) {
    case "lf": return facts.data.quantity;
    case "sheet_product": return facts.data.quantity;
    case "mug": return facts.data.quantity;
    case "notebook": return facts.data.quantity;
    case "pen": return facts.data.quantity;
    case "dtf": return facts.data.quantity;
    case "uv": return facts.data.quantity;
    case "sublimation": return facts.data.quantity;
    case "paper": return facts.data.quantity;
  }
}

function sectionSortKey(key: BoardSectionKey): number {
  return SECTION_ORDER.indexOf(key);
}

/** Board section of a line: UV-DTF stickers (UV technique «transfer») apart from direct UV. */
export function boardSectionKey(pt: ProductType, facts: LineFacts): BoardSectionKey {
  if (pt === "uv_print" && facts.kind === "uv" && facts.data.transfer) return "uv_dtf";
  return pt;
}

/** Sort lines within a group: prio → unread → line status bucket → createdAt desc */
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

function sortLines(lines: WorkshopBoardLine[], now: Date = new Date()): WorkshopBoardLine[] {
  return [...lines].sort((a, b) => {
    // «Ждёт макет» first (oldest flag first), then «✓ Макет исправлен» (newest fix first).
    const aAtt = layoutAttentionRank(a, now);
    const bAtt = layoutAttentionRank(b, now);
    if (aAtt !== bAtt) return aAtt - bAtt;
    if (aAtt === 0) {
      const d = (a.layoutIssue?.since ?? "").localeCompare(b.layoutIssue?.since ?? "");
      if (d !== 0) return d;
    }
    if (aAtt === 1) {
      const d = (b.layoutFixedAt ?? "").localeCompare(a.layoutFixedAt ?? "");
      if (d !== 0) return d;
    }
    if (a.isPrio !== b.isPrio) return a.isPrio ? -1 : 1;
    const aUnread = a.unreadCommentCount > 0 ? 0 : 1;
    const bUnread = b.unreadCommentCount > 0 ? 0 : 1;
    if (aUnread !== bUnread) return aUnread - bUnread;
    // The line's own status in the workshop phase (a waiting mug of an order
    // whose banner prints sorts with the waiting work).
    const aSt = STATUS_SORT_ORDER[boardLineStatus(a.status, a.lineStatus)] ?? 99;
    const bSt = STATUS_SORT_ORDER[boardLineStatus(b.status, b.lineStatus)] ?? 99;
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
  // UV-DTF stickers are sold per linear metre of film.
  const hasUvDtf =
    lines.length > 0 && lines.every((l) => l.facts.kind === "uv" && l.facts.data.transfer === true);
  const totalLinearMeters = hasLf
    ? lines.reduce(
        (s, l) => s + (l.facts.kind === "lf" ? l.facts.data.linearMeters : 0),
        0,
      )
    : hasUvDtf
      ? lines.reduce((s, l) => s + (l.facts.kind === "uv" ? (l.facts.data.filmMeters ?? 0) : 0), 0)
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
export interface GroupLinesOptions {
  /** Current DTF film settings; defaults apply when omitted. */
  dtfFilm?: DtfFilmSpec;
}

export function groupLines(
  orders: RawOrder[],
  options: GroupLinesOptions = {},
): WorkshopBoardSection[] {
  // Map: section key → groupKey → { lines, firstFacts }
  const sectionMap = new Map<
    BoardSectionKey,
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
              penProductSnapshot: order.penProductSnapshot ?? null,
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

      const sectionKey = boardSectionKey(pt, facts);
      if (!sectionMap.has(sectionKey)) {
        sectionMap.set(sectionKey, new Map());
      }
      const groupMap = sectionMap.get(sectionKey)!;

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
        lineStatus: rawLine.productionStatus ?? lineStatusForOrderStatus(order.status),
        layoutIssue:
          rawLine.productionStatus === "NEEDS_LAYOUT"
            ? {
                reason: rawLine.layoutIssueReason ?? null,
                note: rawLine.layoutIssueNote ?? null,
                since: rawLine.layoutIssueAt ?? null,
              }
            : null,
        layoutFixedAt: rawLine.layoutFixedAt ?? null,
        ownerReplacedAt: rawLine.ownerReplacedAt ?? null,
        ownerReplacedRole: rawLine.ownerReplacedRole ?? null,
        isPrio: order.isPrio,
        dealerEditedAt: order.dealerEditedAt ?? null,
        dealerUrgency: order.dealerUrgency ?? null,
        unreadCommentCount: order.unreadCommentCount,
        commentCount: order.commentCount,
        createdAt: order.createdAt,
        productType: pt,
        facts,
        files: rawLine.files,
        notes: order.notes,
        giftSet: giftSetBoardBadge(rawLine.setData, rawLine.giftSetFlags),
        createdByName: order.createdByName,
        sentToWorkshopByName: order.sentToWorkshopByName,
      };

      groupMap.get(key)!.lines.push(boardLine);
    });
  }

  const sections: WorkshopBoardSection[] = [];

  for (const [sectionKey, groupMap] of sectionMap.entries()) {
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
      } else if (firstFacts.kind === "pen") {
        meta.bodyColorHex = firstFacts.data.bodyColorHex;
        meta.clipColorHex = firstFacts.data.clipColorHex;
      } else if (firstFacts.kind === "dtf") {
        meta.dtfFilm = options.dtfFilm ?? DEFAULT_DTF_FILM;
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

    const productType: ProductType = groups[0]!.lines[0]!.productType;
    sections.push({ key: sectionKey, productType, groups, totals });
  }

  // Sort sections in canonical order
  sections.sort((a, b) => sectionSortKey(a.key) - sectionSortKey(b.key));

  return sections;
}

/** Storefront finishing of a sheet line in Russian (print shop product + lamination; business-card lamination / corners), or null. */
export function sheetFinishingRu(data: {
  shopPrint?: { finishingRu?: string };
  shopFinishing?: { lamination?: string; roundedCorners?: boolean };
}): string | null {
  if (data.shopPrint?.finishingRu) return data.shopPrint.finishingRu;
  const f = data.shopFinishing;
  if (!f) return null;
  const parts: string[] = [];
  if (f.lamination) parts.push(`ламинация ${f.lamination === "matte" ? "мат" : "глянец"}`);
  if (f.roundedCorners) parts.push("скруглённые углы");
  return parts.length ? parts.join(" · ") : null;
}

/**
 * Name + quantity of one order line as the staff see it on the board
 * («Кружка 330 мл белая» ×10), for the order history edit diff. `optionsKey`
 * changes when the line's print options change (size, zones, paper…);
 * null when the line cannot be read (legacy rows).
 */
export function lineHistorySummary(
  line: RawOrderLine,
): { name: string; qty: number; optionsKey: string } | null {
  const facts = extractLineFacts(line);
  if (!facts) return null;
  let name: string;
  if (facts.kind === "paper") name = facts.data.label;
  else if (facts.kind === "dtf") {
    const garment = facts.data.garmentNames?.ru ?? facts.data.garmentName;
    name = garment ? `DTF · ${garment}` : DTF_GROUP_LABEL;
  } else name = groupLabel(facts);
  const { quantity: _qty, ...rest } = facts.data as unknown as { quantity?: number } & Record<string, unknown>;
  void _qty;
  // DTF / UV facts carry file ids (replaced files show up as a file change instead).
  const optionsKey = JSON.stringify(rest, (k, v) => (k === "fileId" || k === "fileIds" ? undefined : v));
  return { name, qty: factsQty(facts), optionsKey };
}
