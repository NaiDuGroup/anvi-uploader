import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ShopReportPeriod } from "@/lib/shop/report/period";
import { SHOP_TEST_ORDER_NOTE_PREFIX } from "@/lib/shop/orderFlags";
import {
  ANALYTICS_TZ,
  EMPTY_STATS,
  durationStats,
  flagResolveSeconds,
  heatmapGrid,
  issueReasonCodeFromText,
  slowestStatus,
  type DurationStats,
  type FlagEvent,
} from "./pure";
import { issueReasonLabelSets } from "./reasonLabels";
import type { StatusTimeRow, WorkshopAnalyticsReport } from "./types";

/**
 * «Аналитика цеха» (super admin): everything is aggregated in Postgres from
 * data already recorded (`orders`, `order_lines`, `order_logs`), bounded by
 * the period, and only when the page asks — never on order hot paths. The
 * result is kept in-process for {@link CACHE_TTL_MS} per period.
 *
 * `order_logs.created_at` / `orders.created_at` are UTC `timestamp`s; local
 * (Chișinău) hours come from `AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Chisinau'`.
 */

const CACHE_TTL_MS = 5 * 60_000;
const cache = new Map<string, { expiresAt: number; value: Promise<WorkshopAnalyticsReport> }>();

export function loadWorkshopAnalytics(period: ShopReportPeriod, includeTest: boolean): Promise<WorkshopAnalyticsReport> {
  const key = `${period.from}|${period.to}|${includeTest ? 1 : 0}`;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) return hit.value;
  for (const [k, v] of cache) if (v.expiresAt <= now) cache.delete(k);
  const value = computeWorkshopAnalytics(period, includeTest);
  cache.set(key, { expiresAt: now + CACHE_TTL_MS, value });
  value.catch(() => cache.delete(key));
  return value;
}

type Num = number | bigint | Prisma.Decimal | null;
const n = (v: Num): number => (v == null ? 0 : Number(v));
const nn = (v: Num): number | null => (v == null ? null : Number(v));
const stats = (count: Num, median: Num, p90: Num): DurationStats =>
  n(count) > 0 ? { count: n(count), medianSec: nn(median), p90Sec: nn(p90) } : EMPTY_STATS;

async function computeWorkshopAnalytics(period: ShopReportPeriod, includeTest: boolean): Promise<WorkshopAnalyticsReport> {
  const S = period.start;
  const E = period.end;
  const tz = ANALYTICS_TZ;

  const notTest = includeTest
    ? Prisma.empty
    : Prisma.sql`AND NOT (o.source = 'shop' AND (COALESCE(o.payment_provider, '') = 'test' OR COALESCE(o.notes, '') LIKE ${`${SHOP_TEST_ORDER_NOTE_PREFIX}%`}))`;
  const live = Prisma.sql`o.deleted_at IS NULL ${notTest}`;
  const orderSection = Prisma.sql`(CASE WHEN o.product_type = 'uv_print' AND EXISTS (
      SELECT 1 FROM order_lines ul WHERE ul.order_id = o.id AND ul.uv_line_data->>'technique' = 'transfer'
    ) THEN 'uv_dtf' ELSE o.product_type END)`;
  const urgent = Prisma.sql`(o.is_prio OR o.urgency_by_dealer_at IS NOT NULL OR EXISTS (
      SELECT 1 FROM order_logs ug WHERE ug.order_id = o.id AND ug.action = 'field_updated' AND ug.field = 'isPrio' AND ug.new_value = 'true'
    ))`;
  const local = (col: Prisma.Sql) => Prisma.sql`((${col}) AT TIME ZONE 'UTC' AT TIME ZONE ${tz})`;
  // Orders created in the period (not deleted, not test) + per-order facts.
  const po = Prisma.sql`po AS (
    SELECT o.id, o.created_at, o.client_id, ${orderSection} AS section, ${urgent} AS urgent,
      EXISTS (SELECT 1 FROM order_logs pg WHERE pg.order_id = o.id AND pg.action = 'status_changed' AND pg.new_value = 'ISSUE') AS had_issue,
      EXISTS (SELECT 1 FROM order_logs pg WHERE pg.order_id = o.id AND pg.action = 'line_layout_flagged') AS had_flag
    FROM orders o
    WHERE o.created_at >= ${S} AND o.created_at < ${E} AND ${live}
  )`;

  const [
    sectionRows,
    dealerRows,
    heatRows,
    dayRows,
    dayLineRows,
    leadRows,
    orderStatusRows,
    lineStatusRows,
    reasonRows,
    flagRows,
    reworkRows,
    cancelRows,
    staffRows,
    sinceRows,
  ] = await Promise.all([
    prisma.$queryRaw<{ section: string; orders: Num; urgent: Num; issue: Num; flag: Num; problem: Num }[]>(Prisma.sql`
      WITH ${po}
      SELECT section, count(*) AS orders, count(*) FILTER (WHERE urgent) AS urgent,
        count(*) FILTER (WHERE had_issue) AS issue, count(*) FILTER (WHERE had_flag) AS flag,
        count(*) FILTER (WHERE had_issue OR had_flag) AS problem
      FROM po GROUP BY section`),
    prisma.$queryRaw<{ client_id: string; name: string | null; orders: Num; problems: Num }[]>(Prisma.sql`
      WITH ${po}
      SELECT po.client_id, COALESCE(NULLIF(c.company_name, ''), NULLIF(c.person_name, ''), c.phone) AS name,
        count(*) AS orders, count(*) FILTER (WHERE had_issue OR had_flag) AS problems
      FROM po JOIN clients c ON c.id = po.client_id AND c.is_dealer
      GROUP BY po.client_id, name
      HAVING count(*) FILTER (WHERE had_issue OR had_flag) > 0
      ORDER BY problems DESC, orders DESC LIMIT 10`),
    prisma.$queryRaw<{ isodow: Num; hour: Num; count: Num }[]>(Prisma.sql`
      WITH ${po}
      SELECT EXTRACT(ISODOW FROM ${local(Prisma.sql`po.created_at`)})::int AS isodow,
        EXTRACT(HOUR FROM ${local(Prisma.sql`po.created_at`)})::int AS hour, count(*) AS count
      FROM po GROUP BY 1, 2`),
    prisma.$queryRaw<{ day: string; orders: Num }[]>(Prisma.sql`
      WITH ${po}
      SELECT to_char(${local(Prisma.sql`po.created_at`)}, 'YYYY-MM-DD') AS day, count(*) AS orders
      FROM po GROUP BY 1`),
    prisma.$queryRaw<{ day: string; section: string; lines: Num }[]>(Prisma.sql`
      WITH ${po}
      SELECT to_char(${local(Prisma.sql`po.created_at`)}, 'YYYY-MM-DD') AS day,
        CASE WHEN l.product_type = 'uv_print' AND l.uv_line_data->>'technique' = 'transfer' THEN 'uv_dtf' ELSE l.product_type END AS section,
        count(*) AS lines
      FROM po JOIN order_lines l ON l.order_id = po.id
      GROUP BY 1, 2`),
    // Lead time: orders delivered (first time) in the period.
    prisma.$queryRaw<{ urgent: boolean | null; cnt: Num; med: Num; p90: Num; rcnt: Num; rmed: Num; rp90: Num }[]>(Prisma.sql`
      WITH d AS (
        SELECT g.order_id, min(g.created_at) AS at FROM order_logs g
        WHERE g.action = 'status_changed' AND g.new_value = 'DELIVERED' AND g.created_at >= ${S} AND g.created_at < ${E}
          AND NOT EXISTS (SELECT 1 FROM order_logs e WHERE e.order_id = g.order_id AND e.action = 'status_changed'
            AND e.new_value = 'DELIVERED' AND e.created_at < ${S})
        GROUP BY g.order_id
      ), x AS (
        SELECT GREATEST(0, EXTRACT(EPOCH FROM d.at - o.created_at)) AS lead, ${urgent} AS urgent,
          -- No GREATEST here: it would turn «never ready» (NULL) into 0.
          (SELECT EXTRACT(EPOCH FROM min(r.created_at) - o.created_at) FROM order_logs r
            WHERE r.order_id = o.id AND r.action = 'status_changed'
              AND r.new_value IN ('READY_IN_STUDIO', 'WORKSHOP_READY', 'RETURNED_TO_STUDIO') AND r.created_at <= d.at) AS ready
        FROM d JOIN orders o ON o.id = d.order_id WHERE ${live}
      )
      SELECT urgent, count(*) AS cnt,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY lead) AS med, percentile_cont(0.9) WITHIN GROUP (ORDER BY lead) AS p90,
        count(ready) AS rcnt,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY CASE WHEN ready < 0 THEN 0 ELSE ready END) AS rmed,
        percentile_cont(0.9) WITHIN GROUP (ORDER BY CASE WHEN ready < 0 THEN 0 ELSE ready END) AS rp90
      FROM x GROUP BY ROLLUP (urgent)`),
    // Order time in status: segments that ENDED in the period (previous change via LAG).
    prisma.$queryRaw<{ status: string; section: string | null; all_sections: Num; cnt: Num; med: Num; p90: Num }[]>(Prisma.sql`
      WITH chg AS (
        SELECT DISTINCT g.order_id FROM order_logs g
        WHERE g.action = 'status_changed' AND g.created_at >= ${S} AND g.created_at < ${E}
      ), seq AS (
        SELECT l.order_id, l.old_value, l.created_at,
          LAG(l.created_at) OVER (PARTITION BY l.order_id ORDER BY l.created_at, l.id) AS prev_at
        FROM order_logs l JOIN chg ON chg.order_id = l.order_id
        WHERE l.action = 'status_changed' AND l.created_at < ${E}
      ), seg AS (
        SELECT seq.old_value AS status, ${orderSection} AS section,
          GREATEST(0, EXTRACT(EPOCH FROM seq.created_at - COALESCE(seq.prev_at, o.created_at))) AS dur
        FROM seq JOIN orders o ON o.id = seq.order_id
        WHERE seq.created_at >= ${S} AND seq.old_value IS NOT NULL AND ${live}
      )
      SELECT status, section, GROUPING(section) AS all_sections, count(*) AS cnt,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY dur) AS med, percentile_cont(0.9) WITHIN GROUP (ORDER BY dur) AS p90
      FROM seg GROUP BY GROUPING SETS ((status), (status, section))`),
    // Line production status: same, per order line (`metadata.orderLineId`).
    prisma.$queryRaw<{ status: string; section: string | null; all_sections: Num; cnt: Num; med: Num; p90: Num }[]>(Prisma.sql`
      WITH chg AS (
        SELECT DISTINCT g.metadata->>'orderLineId' AS line_id FROM order_logs g
        WHERE g.action = 'line_status_changed' AND g.created_at >= ${S} AND g.created_at < ${E}
      ), seq AS (
        SELECT l.order_id, l.metadata->>'orderLineId' AS line_id, l.old_value, l.created_at,
          LAG(l.created_at) OVER (PARTITION BY l.metadata->>'orderLineId' ORDER BY l.created_at, l.id) AS prev_at
        FROM order_logs l
        WHERE l.action = 'line_status_changed' AND l.created_at < ${E}
          AND l.metadata->>'orderLineId' IN (SELECT line_id FROM chg)
      ), seg AS (
        SELECT seq.old_value AS status,
          CASE WHEN ol.id IS NULL THEN o.product_type
            WHEN ol.product_type = 'uv_print' AND ol.uv_line_data->>'technique' = 'transfer' THEN 'uv_dtf'
            ELSE ol.product_type END AS section,
          GREATEST(0, EXTRACT(EPOCH FROM seq.created_at - COALESCE(seq.prev_at, o.created_at))) AS dur
        FROM seq JOIN orders o ON o.id = seq.order_id
        LEFT JOIN order_lines ol ON ol.id = seq.line_id
        WHERE seq.created_at >= ${S} AND seq.old_value IS NOT NULL AND ${live}
      )
      SELECT status, section, GROUPING(section) AS all_sections, count(*) AS cnt,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY dur) AS med, percentile_cont(0.9) WITHIN GROUP (ORDER BY dur) AS p90
      FROM seg GROUP BY GROUPING SETS ((status), (status, section))`),
    // Reasons: order ISSUE texts (+ silent key) and line flag codes, in the period.
    prisma.$queryRaw<{ src: "order" | "line"; text: string | null; code: string | null; cnt: Num }[]>(Prisma.sql`
      SELECT 'order' AS src, g.new_value AS text, g.metadata->>'issueReasonCode' AS code, count(*) AS cnt
      FROM order_logs g JOIN orders o ON o.id = g.order_id
      WHERE g.action = 'field_updated' AND g.field = 'issueReason' AND COALESCE(g.new_value, '') <> ''
        AND g.created_at >= ${S} AND g.created_at < ${E} AND ${live}
      GROUP BY 1, 2, 3
      UNION ALL
      SELECT 'line' AS src, NULL AS text, g.new_value AS code, count(*) AS cnt
      FROM order_logs g JOIN orders o ON o.id = g.order_id
      WHERE g.action = 'line_layout_flagged' AND g.created_at >= ${S} AND g.created_at < ${E} AND ${live}
      GROUP BY 1, 2, 3`),
    // Line flag → fix / clear / replace events (resolution may come after the period).
    prisma.$queryRaw<{ line_id: string | null; action: string; at: Date }[]>(Prisma.sql`
      SELECT g.metadata->>'orderLineId' AS line_id, g.action, g.created_at AS at
      FROM order_logs g JOIN orders o ON o.id = g.order_id
      WHERE g.action IN ('line_layout_flagged', 'line_layout_fixed', 'line_layout_cleared', 'line_file_replaced')
        AND g.created_at >= ${S} AND ${live}`),
    // Rework: file replacements and dealer edits in the period, per section.
    prisma.$queryRaw<{ section: string; replaced: Num; fixed: Num; dealer: Num; swaps: Num; rework_orders: Num }[]>(Prisma.sql`
      WITH ev AS (
        SELECT g.order_id, g.action, g.created_at, ${orderSection} AS section,
          (g.action = 'file_removed' AND EXISTS (SELECT 1 FROM order_logs a WHERE a.order_id = g.order_id
            AND a.action = 'file_added' AND a.created_at = g.created_at)) AS swap
        FROM order_logs g JOIN orders o ON o.id = g.order_id
        WHERE g.action IN ('line_file_replaced', 'line_layout_fixed', 'dealer_edited', 'file_removed')
          AND g.created_at >= ${S} AND g.created_at < ${E} AND ${live}
      )
      SELECT section,
        count(*) FILTER (WHERE action = 'line_file_replaced') AS replaced,
        count(*) FILTER (WHERE action = 'line_layout_fixed') AS fixed,
        count(*) FILTER (WHERE action = 'dealer_edited') AS dealer,
        count(DISTINCT order_id || '|' || created_at::text) FILTER (WHERE swap) AS swaps,
        count(DISTINCT order_id) FILTER (WHERE action <> 'file_removed' OR swap) AS rework_orders
      FROM ev GROUP BY section`),
    // Cancellations / deletions (deleted orders included): stage = status at that moment.
    prisma.$queryRaw<{ action: string; stage: string; cnt: Num }[]>(Prisma.sql`
      SELECT g.action, COALESCE(
          CASE WHEN g.action = 'cancelled_by_dealer' THEN g.old_value END,
          (SELECT s.new_value FROM order_logs s WHERE s.order_id = g.order_id AND s.action = 'status_changed'
            AND s.created_at <= g.created_at ORDER BY s.created_at DESC LIMIT 1),
          o.status) AS stage,
        count(*) AS cnt
      FROM order_logs g JOIN orders o ON o.id = g.order_id
      WHERE g.action IN ('deleted', 'cancelled_by_dealer', 'restored') AND g.created_at >= ${S} AND g.created_at < ${E} ${notTest}
      GROUP BY 1, 2`),
    prisma.$queryRaw<{ user_id: string; name: string | null; display_name: string | null; role: string | null; status_changes: Num; line_changes: Num; flags: Num }[]>(Prisma.sql`
      SELECT g.user_id, u.name, u.display_name, u.role,
        count(*) FILTER (WHERE g.action = 'status_changed' AND COALESCE(g.metadata->>'derived', '') <> 'true') AS status_changes,
        count(*) FILTER (WHERE g.action = 'line_status_changed') AS line_changes,
        count(*) FILTER (WHERE g.action = 'line_layout_flagged') AS flags
      FROM order_logs g JOIN orders o ON o.id = g.order_id LEFT JOIN users u ON u.id = g.user_id
      WHERE g.action IN ('status_changed', 'line_status_changed', 'line_layout_flagged')
        AND g.created_at >= ${S} AND g.created_at < ${E} AND ${live}
      GROUP BY g.user_id, u.name, u.display_name, u.role`),
    prisma.$queryRaw<{ order_log: Date | null; line_status: Date | null }[]>(Prisma.sql`
      SELECT (SELECT min(created_at) FROM order_logs WHERE action = 'status_changed') AS order_log,
        (SELECT min(created_at) FROM order_logs WHERE action = 'line_status_changed') AS line_status`),
  ]);

  // ── KPI + sections ──
  const sum = (rows: { [k: string]: unknown }[], k: string) => rows.reduce((a, r) => a + n(r[k] as Num), 0);
  const created = sum(sectionRows, "orders");
  const problemOrders = sum(sectionRows, "problem");
  const urgentOrders = sum(sectionRows, "urgent");

  const leadTotal = leadRows.find((r) => r.urgent == null);
  const leadU = leadRows.find((r) => r.urgent === true);
  const leadN = leadRows.find((r) => r.urgent === false);

  const toStatusRows = (rows: typeof orderStatusRows): StatusTimeRow[] =>
    rows.map((r) => ({
      status: r.status,
      section: n(r.all_sections) === 1 ? null : r.section,
      ...stats(r.cnt, r.med, r.p90),
    }));
  const orderStatusTime = toStatusRows(orderStatusRows);
  const lineStatusTime = toStatusRows(lineStatusRows);

  // ── Reasons ──
  const labels = issueReasonLabelSets();
  const reasonMap = new Map<string, { source: "order" | "line"; code: string; count: number }>();
  const customMap = new Map<string, number>();
  for (const r of reasonRows) {
    let code: string;
    if (r.src === "order") {
      const m = issueReasonCodeFromText(r.text, labels, r.code);
      code = m.code;
      if (m.custom && r.text) {
        const t = r.text.trim();
        customMap.set(t, (customMap.get(t) ?? 0) + n(r.cnt));
      }
    } else {
      code = r.code || "other";
    }
    const k = `${r.src}|${code}`;
    const cur = reasonMap.get(k) ?? { source: r.src, code, count: 0 };
    cur.count += n(r.cnt);
    reasonMap.set(k, cur);
  }

  // ── Line flags ──
  const kindOf: Record<string, FlagEvent["kind"]> = {
    line_layout_flagged: "flagged",
    line_layout_fixed: "fixed",
    line_layout_cleared: "cleared",
    line_file_replaced: "replaced",
  };
  const flagEvents: FlagEvent[] = flagRows
    .filter((r) => r.line_id && !(r.action === "line_layout_flagged" && r.at >= E))
    .map((r) => ({ lineId: r.line_id as string, at: r.at, kind: kindOf[r.action] ?? "fixed" }));
  const lineFlags = flagEvents.filter((e) => e.kind === "flagged").length;

  // ── Load ──
  const daysMap = new Map<string, { orders: number; lines: number }>();
  for (let d = period.from; d <= period.to; d = nextDay(d)) daysMap.set(d, { orders: 0, lines: 0 });
  for (const r of dayRows) {
    const e = daysMap.get(r.day);
    if (e) e.orders += n(r.orders);
  }
  const sectionLines = new Map<string, number>();
  for (const r of dayLineRows) {
    const e = daysMap.get(r.day);
    if (e) e.lines += n(r.lines);
    sectionLines.set(r.section, (sectionLines.get(r.section) ?? 0) + n(r.lines));
  }
  const sectionKeys = new Set<string>([...sectionRows.map((r) => r.section), ...sectionLines.keys()]);
  const loadSections = [...sectionKeys]
    .map((section) => ({
      section,
      orders: n(sectionRows.find((r) => r.section === section)?.orders ?? 0),
      lines: sectionLines.get(section) ?? 0,
    }))
    .sort((a, b) => b.lines - a.lines || b.orders - a.orders);

  // ── Cancellations ──
  const stageMap = new Map<string, { stage: string; deleted: number; cancelledByDealer: number }>();
  let deleted = 0;
  let cancelledByDealer = 0;
  let restored = 0;
  for (const r of cancelRows) {
    const c = n(r.cnt);
    if (r.action === "restored") {
      restored += c;
      continue;
    }
    const e = stageMap.get(r.stage) ?? { stage: r.stage, deleted: 0, cancelledByDealer: 0 };
    if (r.action === "deleted") {
      e.deleted += c;
      deleted += c;
    } else {
      e.cancelledByDealer += c;
      cancelledByDealer += c;
    }
    stageMap.set(r.stage, e);
  }

  const ordersBySection = new Map(sectionRows.map((r) => [r.section, n(r.orders)]));
  const sinceRow = sinceRows[0];

  return {
    period: { from: period.from, to: period.to, days: daysMap.size },
    includeTest,
    generatedAt: new Date().toISOString(),
    logSince: {
      orderLog: sinceRow?.order_log ? sinceRow.order_log.toISOString() : null,
      lineStatus: sinceRow?.line_status ? sinceRow.line_status.toISOString() : null,
    },
    kpi: {
      created,
      delivered: n(leadTotal?.cnt ?? 0),
      problemOrders,
      urgentOrders,
      leadDelivered: leadTotal ? stats(leadTotal.cnt, leadTotal.med, leadTotal.p90) : EMPTY_STATS,
      leadReady: leadTotal ? stats(leadTotal.rcnt, leadTotal.rmed, leadTotal.rp90) : EMPTY_STATS,
    },
    orderStatusTime,
    lineStatusTime,
    slowestOrderStatus: slowestStatus(orderStatusTime.filter((r) => r.section == null)),
    slowestLineStatus: slowestStatus(lineStatusTime.filter((r) => r.section == null)),
    fileProblems: {
      problemOrders,
      issueOrders: sum(sectionRows, "issue"),
      flaggedOrders: sum(sectionRows, "flag"),
      lineFlags,
      byDealer: dealerRows.map((r) => ({
        clientId: r.client_id,
        name: r.name ?? "—",
        orders: n(r.orders),
        problems: n(r.problems),
      })),
      bySection: sectionRows
        .map((r) => ({ section: r.section, orders: n(r.orders), problems: n(r.problem) }))
        .sort((a, b) => b.problems - a.problems || b.orders - a.orders),
      reasons: [...reasonMap.values()].sort((a, b) => b.count - a.count),
      customTexts: [...customMap]
        .map(([text, count]) => ({ text, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8),
      issueTime: orderStatusTime.find((r) => r.status === "ISSUE" && r.section == null) ?? EMPTY_STATS,
      lineResolve: durationStats(flagResolveSeconds(flagEvents)),
    },
    rework: {
      rows: reworkRows
        .map((r) => ({
          section: r.section,
          orders: ordersBySection.get(r.section) ?? 0,
          fileReplaced: n(r.replaced),
          layoutFixed: n(r.fixed),
          fileSwaps: n(r.swaps),
          dealerEdits: n(r.dealer),
          reworkOrders: n(r.rework_orders),
        }))
        .sort((a, b) => b.reworkOrders - a.reworkOrders),
    },
    cancellations: {
      deleted,
      cancelledByDealer,
      restored,
      byStage: [...stageMap.values()].sort((a, b) => b.deleted + b.cancelledByDealer - (a.deleted + a.cancelledByDealer)),
    },
    load: {
      heatmap: heatmapGrid(heatRows.map((r) => ({ isodow: n(r.isodow), hour: n(r.hour), count: n(r.count) }))),
      days: [...daysMap].map(([day, v]) => ({ day, ...v })),
      sections: loadSections,
    },
    urgent: {
      orders: urgentOrders,
      leadUrgent: leadU ? stats(leadU.cnt, leadU.med, leadU.p90) : EMPTY_STATS,
      leadNormal: leadN ? stats(leadN.cnt, leadN.med, leadN.p90) : EMPTY_STATS,
    },
    staff: staffRows
      .map((r) => ({
        userId: r.user_id,
        name: r.display_name || r.name || "—",
        role: r.role,
        statusChanges: n(r.status_changes),
        lineChanges: n(r.line_changes),
        flags: n(r.flags),
      }))
      .filter((r) => r.statusChanges + r.lineChanges + r.flags > 0)
      .sort((a, b) => b.statusChanges + b.lineChanges + b.flags - (a.statusChanges + a.lineChanges + a.flags)),
  };
}

function nextDay(day: string): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}
