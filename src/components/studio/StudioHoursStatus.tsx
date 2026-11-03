"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { displayTime, studioStatus, type StudioStatus, type WeekHours } from "@/lib/studioInfo/studioHours";

/**
 * Live «Открыто до 18:00» / «Обед до 13:10» / «Закрыто · откроется …» badge,
 * computed in the studio's time zone. Rendered only after mount (server and
 * client clocks differ → no hydration mismatch) and refreshed every minute.
 */
export function StudioHoursStatus({
  hours,
  timezone,
  className,
}: {
  hours: WeekHours;
  timezone: string;
  className?: string;
}) {
  const { t } = useLanguageStore();
  const [status, setStatus] = useState<StudioStatus | null>(null);

  useEffect(() => {
    const tick = () => setStatus(studioStatus(hours, new Date(), timezone));
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [hours, timezone]);

  if (!status) return <span className={cn("inline-block h-5", className)} aria-hidden />;

  const f = t.footer;
  let text: string;
  let tone: string;
  if (status.kind === "open") {
    text = f.statusOpen(displayTime(status.until));
    tone = "bg-emerald-50 text-emerald-800 ring-emerald-200";
  } else if (status.kind === "lunch") {
    text = f.statusLunch(displayTime(status.until));
    tone = "bg-amber-50 text-amber-800 ring-amber-200";
  } else {
    const at = status.opensAt ? displayTime(status.opensAt) : "";
    text = !status.opensDay
      ? f.statusClosed
      : status.opensIn === "today"
        ? f.statusClosedToday(at)
        : status.opensIn === "tomorrow"
          ? f.statusClosedTomorrow(at)
          : f.statusClosedOn(f.weekdayOn[status.opensDay], at);
    tone = "bg-gray-100 text-gray-700 ring-gray-200";
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        tone,
        className,
      )}
      role="status"
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          status.kind === "open" ? "bg-emerald-500" : status.kind === "lunch" ? "bg-amber-500" : "bg-gray-400",
        )}
        aria-hidden
      />
      {text}
    </span>
  );
}

/** «Пн–Пт 9:00–18:00 · Сб 10:00–15:00 · Вс выходной» + «обед 12:30–13:10». */
export function useHoursSummaryText(summary: {
  rows: { fromDay: keyof WeekHours; toDay: keyof WeekHours; span: { from: string; to: string } | null }[];
  lunch: { from: string; to: string } | null;
}): { rows: string[]; lunch: string | null } {
  const { t } = useLanguageStore();
  const f = t.footer;
  const rows = summary.rows.map((r) => {
    const days = r.fromDay === r.toDay ? f.weekdayShort[r.fromDay] : `${f.weekdayShort[r.fromDay]}–${f.weekdayShort[r.toDay]}`;
    const span = r.span ? `${displayTime(r.span.from)}–${displayTime(r.span.to)}` : f.dayOff;
    return `${days} ${span}`;
  });
  return {
    rows,
    lunch: summary.lunch ? f.lunch(displayTime(summary.lunch.from), displayTime(summary.lunch.to)) : null,
  };
}
