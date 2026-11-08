/**
 * Order history drawer («Istoric — #9812»): turns raw `OrderLog` rows into
 * plain sentences «Vera (studio) a marcat comanda ca urgentă», an icon kind,
 * optional status chips and a short «what changed» line. Pure, client-safe.
 * Raw action / field keys are never shown: unknown ones read «a modificat comanda».
 */
import type { TranslationDictionary } from "@/lib/i18n/types";
import type { Locale } from "@/lib/i18n";
import { layoutIssueReasonLabel } from "@/lib/layoutIssueClient";
import { lineTypeKey, lineTypeLabel } from "@/lib/productTypeIcons";
import { parseOrderEditChanges, type OrderEditChange } from "@/lib/orderEditDiff";

export interface HistoryEntry {
  id: string;
  action: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  userName: string;
  userRole: string;
}

/** Round icon of an entry (colour + lucide icon picked by the panel). */
export type HistoryIconKind =
  | "created"
  | "status"
  | "urgency"
  | "payment"
  | "payment_problem"
  | "price"
  | "file_added"
  | "file_removed"
  | "file_replaced"
  | "problem"
  | "problem_cleared"
  | "shipping"
  | "client"
  | "edit"
  | "deleted"
  | "restored"
  | "cancelled";

export interface DescribedHistoryEntry {
  kind: HistoryIconKind;
  /** Verb phrase after the actor («a schimbat statusul»), or a whole sentence when `showActor` is false. */
  text: string;
  showActor: boolean;
  /** Old → new status codes, drawn as coloured chips. */
  status?: { from: string | null; to: string | null; scope: "order" | "line" };
  /** Small grey lines under the sentence. */
  details: string[];
}

type T = TranslationDictionary;

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

function money(v: unknown, t: T): string {
  const n = num(v);
  return n == null ? t.orderHistory.empty : t.orderHistory.money(n);
}

function lineCode(entry: HistoryEntry): string {
  return str(entry.metadata?.lineCode) ?? "?";
}

function fee(entry: HistoryEntry): number {
  return num(entry.metadata?.feeMdl) ?? 0;
}

/** Old / new file names of a per-file replace (`replacedFileName` / `newFileName`), null for older entries. */
export function replacedFileNames(entry: Pick<HistoryEntry, "metadata">): { oldName: string; newName: string } | null {
  const oldName = str(entry.metadata?.replacedFileName);
  const newName = str(entry.metadata?.newFileName);
  return oldName && newName ? { oldName, newName } : null;
}

/** «Vera», «Clientul»: the actor shown first. */
export function actorName(entry: Pick<HistoryEntry, "userName" | "userRole">, t: T): string {
  if (entry.userRole === "client" && entry.userName === "Client") return capitalize(t.orderHistory.roles.client);
  if (entry.userRole === "unknown") return capitalize(t.orderHistory.roles.unknown);
  return entry.userName;
}

/** Role in simple words («studio», «atelier», «dealer»), null when the name already says it. */
export function actorRole(entry: Pick<HistoryEntry, "userName" | "userRole">, t: T): string | null {
  const roles = t.orderHistory.roles;
  if (entry.userRole === "unknown" || (entry.userRole === "client" && entry.userName === "Client")) return null;
  switch (entry.userRole) {
    case "admin":
    case "superadmin":
    case "workshop":
    case "client":
    case "dealer":
      return roles[entry.userRole];
    case "customer":
      return roles.client;
    default:
      return roles.unknown;
  }
}

export function capitalize(s: string): string {
  return s.length > 0 ? s[0]!.toLocaleUpperCase() + s.slice(1) : s;
}

const CYRILLIC = /[\u0400-\u04FF]/;

/** A stored line name when this language can show it (board names are often Russian), else null. */
function readableName(name: string | null, t: T): string | null {
  if (!name) return null;
  return t.orderHistory.cyrillicLineNames || !CYRILLIC.test(name) ? name : null;
}

function lineName(c: { name: string | null; type: string }, t: T): string {
  const name = readableName(c.name, t);
  if (name) return name;
  const key = lineTypeKey(c.type);
  return key ? lineTypeLabel(key, t) : t.orderHistory.empty;
}

/** «Căni: 10 → 12 buc · Preț: 340 → 380 lei» from `metadata.changes`. */
export function summarizeOrderChanges(changes: readonly OrderEditChange[], t: T): string {
  const h = t.orderHistory;
  const qty = (n: number | null) => (n == null ? null : h.pcs(n));
  const parts = changes.map((c) => {
    switch (c.kind) {
      case "line_added":
        return h.change.lineAdded(lineName(c, t), qty(c.qty));
      case "line_removed":
        return h.change.lineRemoved(lineName(c, t), qty(c.qty));
      case "line_qty":
        return h.change.lineQty(lineName(c, t), String(c.from), h.pcs(c.to));
      case "line_product":
        return h.change.lineProduct(c.fromName ?? h.empty, lineName(c, t));
      case "line_files":
        return h.change.lineFiles(lineName(c, t));
      case "line_options":
        return h.change.lineOptions(lineName(c, t));
      case "price":
        return h.change.price(c.from == null ? h.empty : String(c.from), money(c.to, t));
      case "client":
        return h.change.client(c.from ?? h.empty, c.to ?? h.empty);
      case "phone":
        return h.change.phone(c.from ?? h.empty, c.to ?? h.empty);
      case "notes":
        return h.change.notes;
    }
  });
  return parts.join(" · ");
}

function describeField(entry: HistoryEntry, t: T): DescribedHistoryEntry {
  const h = t.orderHistory;
  const to = entry.newValue;
  const from = entry.oldValue;
  const base = (kind: HistoryIconKind, text: string, details: string[] = []): DescribedHistoryEntry => ({
    kind,
    text,
    showActor: true,
    details,
  });
  switch (entry.field) {
    case "status":
      return { ...base("status", h.statusChanged), status: { from, to, scope: "order" } };
    case "isPrio":
      return base("urgency", to === "true" ? h.urgentOn : h.urgentOff);
    case "isPaid": {
      if (to !== "true") return base("payment", h.paidOff);
      const provider = str(entry.metadata?.paymentProvider);
      return base("payment", provider ? h.paidOnline(capitalize(provider)) : h.paidOn);
    }
    case "price":
      if (num(to) == null) return base("price", h.priceCleared);
      if (num(from) == null) return base("price", h.priceSet(money(to, t)));
      return base("price", h.priceChanged(money(from, t), money(to, t)));
    case "notes":
      return base("edit", h.notesChanged);
    case "phone":
      return base("edit", h.phoneChanged(from || h.empty, to || h.empty));
    case "clientName":
      return base("client", h.clientNameChanged(from || h.empty, to || h.empty));
    case "clientId":
      return base("client", to ? h.clientLinked : h.clientCleared);
    case "issueReason":
      return to ? base("problem", h.issueSet(to)) : base("problem_cleared", h.issueCleared);
    case "approval_feedback":
      return base("edit", h.approvalFeedback, to ? [h.comment(to)] : []);
    case "trackingNumber":
      return to ? base("shipping", h.trackingSet(to)) : base("shipping", h.trackingCleared);
    case "shippedAt":
      return base("shipping", to ? h.shippedOn : h.shippedOff);
    case "order_structure": {
      const changes = parseOrderEditChanges(entry.metadata);
      return base("edit", h.edited, changes.length > 0 ? [summarizeOrderChanges(changes, t)] : []);
    }
    default:
      return base("edit", h.edited);
  }
}

/** One history entry as a plain sentence (without the actor) + icon + chips + details. */
export function describeHistoryEntry(entry: HistoryEntry, t: T): DescribedHistoryEntry {
  const h = t.orderHistory;
  const plain = (kind: HistoryIconKind, text: string, details: string[] = []): DescribedHistoryEntry => ({
    kind,
    text,
    showActor: true,
    details,
  });
  const urgencyFee = (mdl: number) => t.dealerUrgency.amount(mdl);

  switch (entry.action) {
    case "order_created":
      return plain("created", h.created);
    case "status_changed": {
      const status = { from: entry.oldValue, to: entry.newValue, scope: "order" as const };
      if (entry.metadata?.derived === true) {
        return { kind: "status", text: capitalize(h.statusDerived), showActor: false, status, details: [] };
      }
      return { ...plain("status", h.statusChanged), status };
    }
    case "line_status_changed":
      return {
        ...plain("status", h.lineStatusChanged(lineCode(entry))),
        status: { from: entry.oldValue, to: entry.newValue, scope: "line" },
      };
    case "line_layout_flagged": {
      const note = str(entry.metadata?.note);
      const reason = layoutIssueReasonLabel(t.layoutIssue, str(entry.metadata?.reason));
      return plain("problem", h.layoutFlagged(lineCode(entry), reason), note ? [h.comment(note)] : []);
    }
    case "line_layout_cleared":
      return plain("problem_cleared", h.layoutCleared(lineCode(entry)));
    case "line_layout_fixed": {
      const names = replacedFileNames(entry);
      return plain(
        "file_replaced",
        names ? h.fileReplaced(lineCode(entry), names.oldName, names.newName) : h.layoutFixed(lineCode(entry)),
      );
    }
    case "line_file_replaced": {
      const names = replacedFileNames(entry);
      return plain(
        "file_replaced",
        names ? h.fileReplaced(lineCode(entry), names.oldName, names.newName) : h.fileReplacedShort(lineCode(entry)),
      );
    }
    case "field_updated":
      return describeField(entry, t);
    case "file_added":
      return plain("file_added", h.fileAdded(str(entry.metadata?.fileName) ?? h.empty));
    case "file_removed":
      return plain("file_removed", h.fileRemoved(str(entry.metadata?.fileName) ?? h.empty));
    case "file_updated":
      return plain("file_replaced", h.fileUpdated(str(entry.metadata?.fileName) ?? h.empty));
    case "deleted":
      return plain("deleted", h.deleted);
    case "restored":
      return plain("restored", h.restored);
    case "payment_mismatch":
      return plain(
        "payment_problem",
        h.paymentMismatch(money(entry.metadata?.paidMdl, t), money(entry.metadata?.totalMdl ?? entry.oldValue, t)),
      );
    case "dealer_edited": {
      const changes = parseOrderEditChanges(entry.metadata);
      if (changes.length > 0) return plain("edit", h.dealerEdited, [summarizeOrderChanges(changes, t)]);
      // Older entries: the price (old → new) and a notes flag only.
      const parts: string[] = [];
      if (num(entry.oldValue) !== num(entry.newValue)) {
        parts.push(h.change.price(money(entry.oldValue, t), money(entry.newValue, t)));
      }
      if (entry.metadata?.notesChanged === true) parts.push(h.change.notes);
      return plain("edit", h.dealerEdited, parts.length > 0 ? [parts.join(" · ")] : []);
    }
    case "cancelled_by_dealer": {
      const reason = str(entry.metadata?.reason);
      return {
        ...plain("cancelled", h.dealerCancelled, reason ? [h.reason(reason)] : []),
        status: { from: entry.oldValue, to: entry.newValue, scope: "order" },
      };
    }
    case "urgency_dealer_on":
      return plain("urgency", h.urgencyDealerOn(t.dealerUrgency.feeShort(fee(entry))));
    case "urgency_dealer_off":
      return plain("urgency", h.urgencyDealerOff);
    case "urgency_staff_off":
      return plain("urgency", h.urgencyStaffOff(urgencyFee(fee(entry))));
    case "urgency_fee_waived":
      return plain("price", h.urgencyFeeWaived(urgencyFee(fee(entry))));
    default:
      return plain("edit", h.edited);
  }
}

/** Translated status name for a chip, null when the code is unknown (chip hidden). */
export function historyStatusLabel(code: string | null, scope: "order" | "line", t: T): string | null {
  if (!code) return null;
  if (scope === "line") {
    const v = (t.lineStatus as unknown as Record<string, unknown>)[code];
    return code === code.toUpperCase() && typeof v === "string" ? v : null;
  }
  const v = (t.statuses as Record<string, string>)[code];
  return typeof v === "string" ? v : null;
}

const NOISE_WINDOW_MS = 2 * 60 * 1000;

/**
 * Old «order_structure» rows written by every admin save (no details): the one
 * right after the order was created by the same person says nothing → hidden.
 */
export function isNoiseEntry(entry: HistoryEntry, all: readonly HistoryEntry[]): boolean {
  if (entry.action !== "field_updated" || entry.field !== "order_structure") return false;
  if (parseOrderEditChanges(entry.metadata).length > 0) return false;
  const at = Date.parse(entry.createdAt);
  return all.some((e) => {
    if (e.action !== "order_created" || e.userName !== entry.userName) return false;
    const created = Date.parse(e.createdAt);
    return at >= created && at - created <= NOISE_WINDOW_MS;
  });
}

export function visibleHistoryEntries<E extends HistoryEntry>(entries: readonly E[]): E[] {
  return entries.filter((e) => !isNoiseEntry(e, entries));
}

const LOCALE_TAGS: Record<Locale, string> = { ro: "ro-RO", ru: "ru-RU", en: "en-GB" };

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** «Azi», «Ieri», «Miercuri, 5 noiembrie» (year added when not this year). */
export function historyDayLabel(date: Date, locale: Locale, t: T, now: Date = new Date()): string {
  if (dayKey(date) === dayKey(now)) return t.orderHistory.today;
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (dayKey(date) === dayKey(y)) return t.orderHistory.yesterday;
  const label = new Intl.DateTimeFormat(LOCALE_TAGS[locale] ?? "ro-RO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" as const } : {}),
  }).format(date);
  return capitalize(label);
}

export function historyTime(iso: string, locale: Locale): string {
  return new Date(iso).toLocaleTimeString(LOCALE_TAGS[locale] ?? "ro-RO", { hour: "2-digit", minute: "2-digit" });
}

/** Entries (newest first) grouped by local day, keeping their order. */
export function groupHistoryByDay<E extends HistoryEntry>(
  entries: readonly E[],
  locale: Locale,
  t: T,
  now: Date = new Date(),
): { key: string; label: string; entries: E[] }[] {
  const groups: { key: string; label: string; entries: E[] }[] = [];
  for (const e of entries) {
    const d = new Date(e.createdAt);
    const key = dayKey(d);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.entries.push(e);
    else groups.push({ key, label: historyDayLabel(d, locale, t, now), entries: [e] });
  }
  return groups;
}
