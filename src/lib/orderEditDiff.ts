/**
 * What an order edit changed, for the order history («Istoric»). Pure: the
 * caller reads the order before and after the save, this compares them and
 * returns a short structured list stored in `OrderLog.metadata.changes`.
 *
 * Only data every history reader (staff) already sees: line names, quantities,
 * the order price, client, phone. Never costs or purchase prices.
 */

/** A line as the history shows it. `name` null = legacy line the board cannot read. */
export interface OrderLineHistorySnapshot {
  id: string;
  productType: string;
  name: string | null;
  qty: number | null;
  /** Sorted file keys (url · color · paper); copies count as quantity, not as a file change. */
  filesKey: string;
  optionsKey: string | null;
}

export interface OrderHistorySnapshot {
  lines: OrderLineHistorySnapshot[];
  price: number | null;
  phone: string | null;
  clientId: string | null;
  clientName: string | null;
  notes: string | null;
}

interface LineRef {
  /** Product name as the staff see it; null → the UI shows the product type. */
  name: string | null;
  type: string;
}

export type OrderEditChange =
  | ({ kind: "line_added"; qty: number | null } & LineRef)
  | ({ kind: "line_removed"; qty: number | null } & LineRef)
  | ({ kind: "line_qty"; from: number; to: number } & LineRef)
  | ({ kind: "line_product"; fromName: string | null } & LineRef)
  | ({ kind: "line_files" } & LineRef)
  | ({ kind: "line_options" } & LineRef)
  | { kind: "price"; from: number | null; to: number | null }
  | { kind: "client"; from: string | null; to: string | null }
  | { kind: "phone"; from: string | null; to: string | null }
  | { kind: "notes" };

export type OrderEditChangeKind = OrderEditChange["kind"];

const KNOWN_KINDS = new Set<string>([
  "line_added",
  "line_removed",
  "line_qty",
  "line_product",
  "line_files",
  "line_options",
  "price",
  "client",
  "phone",
  "notes",
]);

const norm = (s: string | null | undefined): string | null => {
  const v = s?.trim();
  return v ? v : null;
};

const money = (n: number | null | undefined): number | null =>
  n == null || !Number.isFinite(n) ? null : Math.round(n * 100) / 100;

/** Changes between two snapshots of one order; [] when nothing a person would notice changed. */
export function diffOrderEdit(before: OrderHistorySnapshot, after: OrderHistorySnapshot): OrderEditChange[] {
  const changes: OrderEditChange[] = [];
  const afterById = new Map(after.lines.map((l) => [l.id, l]));
  const beforeIds = new Set(before.lines.map((l) => l.id));
  const ref = (l: OrderLineHistorySnapshot): LineRef => ({ name: l.name, type: l.productType });

  for (const b of before.lines) {
    const a = afterById.get(b.id);
    if (!a) {
      changes.push({ kind: "line_removed", ...ref(b), qty: b.qty });
      continue;
    }
    const productChanged = a.productType !== b.productType || (a.name !== b.name && b.name != null);
    const qtyChanged = a.qty != null && b.qty != null && a.qty !== b.qty;
    if (productChanged) changes.push({ kind: "line_product", ...ref(a), fromName: b.name });
    if (qtyChanged) changes.push({ kind: "line_qty", ...ref(a), from: b.qty!, to: a.qty! });
    if (a.filesKey !== b.filesKey) {
      changes.push({ kind: "line_files", ...ref(a) });
    } else if (!productChanged && !qtyChanged && a.optionsKey !== b.optionsKey) {
      // Options derived from the quantity (sheets, metres) are covered by the qty change.
      changes.push({ kind: "line_options", ...ref(a) });
    }
  }
  for (const a of after.lines) {
    if (!beforeIds.has(a.id)) changes.push({ kind: "line_added", ...ref(a), qty: a.qty });
  }

  const pFrom = money(before.price);
  const pTo = money(after.price);
  if (pFrom !== pTo) changes.push({ kind: "price", from: pFrom, to: pTo });

  if (before.clientId !== after.clientId || norm(before.clientName) !== norm(after.clientName)) {
    changes.push({ kind: "client", from: norm(before.clientName), to: norm(after.clientName) });
  }
  if (norm(before.phone) !== norm(after.phone)) {
    changes.push({ kind: "phone", from: norm(before.phone), to: norm(after.phone) });
  }
  if (norm(before.notes) !== norm(after.notes)) changes.push({ kind: "notes" });
  return changes;
}

/** `metadata.changes` of a history entry, keeping only well-formed known kinds (old rows → []). */
export function parseOrderEditChanges(metadata: unknown): OrderEditChange[] {
  if (!metadata || typeof metadata !== "object") return [];
  const raw = (metadata as { changes?: unknown }).changes;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (c): c is OrderEditChange =>
      c != null && typeof c === "object" && KNOWN_KINDS.has(String((c as { kind?: unknown }).kind)),
  );
}
