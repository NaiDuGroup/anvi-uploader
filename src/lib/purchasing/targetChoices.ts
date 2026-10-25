import {
  isRetiredKind,
  LEGACY_STOCK_TARGET_KINDS,
  pickLocalized,
  StockTargetKind,
  unifiedVariantLabel,
  type LegacyStockTargetKind,
  type StockTargetGroup,
  type StockTargetOption,
} from "./types";

/**
 * The «Склад» picker on purchase screens: legacy kinds (one entry each) plus
 * one entry per unified stock category. A choice is encoded as a plain string
 * so it fits a `<select>` value: the legacy kind itself, or
 * `stock_variant:<categoryId>`.
 */

export const UNIFIED_CHOICE_PREFIX = `${StockTargetKind.StockVariant}:`;

export type ParsedChoice =
  | { kind: LegacyStockTargetKind; groupId: null }
  | { kind: StockTargetKind.StockVariant; groupId: string };

export function unifiedChoice(groupId: string): string {
  return `${UNIFIED_CHOICE_PREFIX}${groupId}`;
}

export function parseChoice(value: string): ParsedChoice | null {
  if (value.startsWith(UNIFIED_CHOICE_PREFIX)) {
    const groupId: string = value.slice(UNIFIED_CHOICE_PREFIX.length);
    return groupId === "" ? null : { kind: StockTargetKind.StockVariant, groupId };
  }
  const kind: LegacyStockTargetKind | undefined = LEGACY_STOCK_TARGET_KINDS.find((k) => k === value);
  return kind ? { kind, groupId: null } : null;
}

export function findTarget(
  known: readonly StockTargetOption[],
  kind: StockTargetKind,
  targetId: string | null,
): StockTargetOption | undefined {
  return targetId ? known.find((o) => o.kind === kind && o.id === targetId) : undefined;
}

/** Picker choice for a saved target; unified targets resolve to their category. */
export function choiceForTarget(
  kind: StockTargetKind,
  targetId: string | null,
  known: readonly StockTargetOption[],
): string {
  if (kind !== StockTargetKind.StockVariant) return kind;
  const group: StockTargetGroup | undefined = findTarget(known, kind, targetId)?.unified?.group;
  return group ? unifiedChoice(group.id) : StockTargetKind.Ignore;
}

/** Unified categories that have at least one option, in catalogue order. */
export function unifiedGroups(
  targets: readonly StockTargetOption[],
  locale: string,
): StockTargetGroup[] {
  const byId = new Map<string, StockTargetGroup>();
  for (const o of targets) {
    if (o.unified && !byId.has(o.unified.group.id)) byId.set(o.unified.group.id, o.unified.group);
  }
  return [...byId.values()].sort(
    (a, b) =>
      a.sortOrder - b.sortOrder ||
      pickLocalized(a.names, locale).localeCompare(pickLocalized(b.names, locale)),
  );
}

export type ChoiceEntry = { value: string; label: string };

/**
 * Entries for the «Склад» select: legacy kinds first (retired ones such as DTF
 * garments left out), then unified categories, «not a stock item» last.
 * `legacyLabel` supplies the translated kind names.
 */
export function warehouseChoices(
  targets: readonly StockTargetOption[],
  locale: string,
  legacyLabel: (kind: LegacyStockTargetKind) => string,
): ChoiceEntry[] {
  const legacy: ChoiceEntry[] = LEGACY_STOCK_TARGET_KINDS.filter(
    (k) => k !== StockTargetKind.Ignore && !isRetiredKind(k),
  ).map((k) => ({ value: k, label: legacyLabel(k) }));
  const unified: ChoiceEntry[] = unifiedGroups(targets, locale).map((g) => ({
    value: unifiedChoice(g.id),
    label: pickLocalized(g.names, locale),
  }));
  return [
    ...legacy,
    ...unified,
    { value: StockTargetKind.Ignore, label: legacyLabel(StockTargetKind.Ignore) },
  ];
}

/** Options of the «Позиция» select for a choice. */
export function optionsForChoice(
  targets: readonly StockTargetOption[],
  choice: string,
): StockTargetOption[] {
  const parsed: ParsedChoice | null = parseChoice(choice);
  if (!parsed) return [];
  if (parsed.kind === StockTargetKind.StockVariant) {
    return targets.filter((o) => o.unified?.group.id === parsed.groupId);
  }
  return targets.filter((o) => o.kind === parsed.kind);
}

/** «Item name — variant label (SKU)» in the viewer's language. */
export function localizedUnifiedLabel(option: StockTargetOption, locale: string): string {
  const u = option.unified;
  return u ? unifiedVariantLabel(pickLocalized(u.itemNames, locale), u.variantLabel, u.sku) : option.name;
}

/**
 * «Склад» choice for a line with no suggestion: the roll-media category (rolls
 * are the most common purchase; the old default was the `lf_material` kind),
 * else the first category, else «not a stock item».
 */
export function defaultWarehouseChoice(targets: readonly StockTargetOption[], locale: string): string {
  const roll: StockTargetOption | undefined = targets.find((o) => o.unified && o.widthMeters != null);
  if (roll?.unified) return unifiedChoice(roll.unified.group.id);
  const first: StockTargetGroup | undefined = unifiedGroups(targets, locale)[0];
  return first ? unifiedChoice(first.id) : StockTargetKind.Ignore;
}
