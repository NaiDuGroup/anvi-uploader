"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { cn } from "@/lib/utils";

function fmtShort(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const d = new Date(year, month, 1);
  while (d.getMonth() === month) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

const LOCALE_MAP: Record<string, string> = {
  ro: "ro-RO",
  ru: "ru-RU",
  en: "en-US",
};

export const DateRangeFilter = memo(function DateRangeFilter({
  dateFrom,
  dateTo,
  onChange,
  locale,
  t,
  className,
}: {
  dateFrom: string;
  dateTo: string;
  onChange: (from: string, to: string) => void;
  locale: string;
  t: ReturnType<typeof useLanguageStore.getState>["t"];
  /** Optional wrapper classes (e.g. width in a filter toolbar). */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const hasValue = !!(dateFrom || dateTo);

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [picking, setPicking] = useState<"from" | "to">("from");

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (open) {
      const ref = dateFrom || dateTo || toIso(today);
      const [y, m] = ref.split("-").map(Number);
      setViewYear(y);
      setViewMonth(m - 1);
      setPicking(dateFrom ? "to" : "from");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const intlLocale = LOCALE_MAP[locale] ?? "ro-RO";
  const monthName = new Date(viewYear, viewMonth, 1).toLocaleDateString(
    intlLocale,
    { month: "long", year: "numeric" },
  );
  const weekDays = useMemo(() => {
    const base = new Date(2024, 0, 1);
    while (base.getDay() !== 1) base.setDate(base.getDate() + 1);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(d.getDate() + i);
      return d.toLocaleDateString(intlLocale, { weekday: "short" }).slice(0, 2);
    });
  }, [intlLocale]);

  const days = getDaysInMonth(viewYear, viewMonth);
  const startDow = (days[0].getDay() + 6) % 7;
  const leadingBlanks = startDow;

  const handleDayClick = (day: Date) => {
    const iso = toIso(day);
    if (picking === "from") {
      if (dateTo && iso > dateTo) {
        onChange(iso, "");
        setPicking("to");
      } else {
        onChange(iso, dateTo);
        setPicking("to");
      }
    } else {
      if (dateFrom && iso < dateFrom) {
        onChange(iso, dateFrom);
      } else {
        onChange(dateFrom, iso);
      }
      setPicking("from");
    }
  };

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else setViewMonth((m) => m + 1);
  };

  const label = !hasValue
    ? t.admin.filterByDate
    : dateFrom && dateTo
      ? `${fmtShort(dateFrom)} – ${fmtShort(dateTo)}`
      : dateFrom
        ? `${t.admin.filterDateFrom} ${fmtShort(dateFrom)}`
        : `${t.admin.filterDateTo} ${fmtShort(dateTo)}`;

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex w-[190px] cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-[7px] text-xs font-medium transition-colors hover:bg-gray-50 ${
          hasValue
            ? "border-amber-300 bg-amber-50 text-amber-800"
            : "border-gray-300 bg-white text-gray-600"
        }`}
      >
        <CalendarDays className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        {hasValue ? (
          <span
            role="button"
            tabIndex={0}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onChange("", "");
            }}
            className="-mr-1 cursor-pointer rounded p-0.5 transition-colors hover:bg-amber-200/60"
          >
            <X className="h-3 w-3" />
          </span>
        ) : (
          <ChevronDown
            className={`h-3 w-3 shrink-0 opacity-50 transition-transform ${open ? "rotate-180" : ""}`}
          />
        )}
      </button>

      {open && (
        <div className="absolute left-0 z-50 mt-1 w-[280px] select-none rounded-xl border border-gray-200 bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={prevMonth}
              className="rounded-md p-1 text-gray-500 transition-colors hover:bg-gray-100"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold capitalize text-gray-700">
              {monthName}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              className="rounded-md p-1 text-gray-500 transition-colors hover:bg-gray-100"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7">
            {weekDays.map((wd, i) => (
              <div
                key={i}
                className="py-1 text-center text-[10px] font-medium uppercase text-gray-400"
              >
                {wd}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {Array.from({ length: leadingBlanks }).map((_, i) => (
              <div key={`b-${i}`} />
            ))}
            {days.map((day) => {
              const iso = toIso(day);
              const isFrom = iso === dateFrom;
              const isTo = iso === dateTo;
              const inRange =
                dateFrom && dateTo && iso > dateFrom && iso < dateTo;
              const isToday = iso === toIso(today);

              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => handleDayClick(day)}
                  className={`relative h-8 rounded-md text-xs transition-colors ${
                    isFrom || isTo
                      ? "bg-amber-500 font-bold text-white"
                      : inRange
                        ? "bg-amber-100 text-amber-900"
                        : isToday
                          ? "font-bold text-amber-600 hover:bg-amber-50"
                          : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between">
            <span className="text-[10px] text-gray-400">
              {picking === "from"
                ? `↳ ${t.admin.filterDateFrom}`
                : `↳ ${t.admin.filterDateTo}`}
            </span>
            {hasValue && (
              <button
                type="button"
                onClick={() => {
                  onChange("", "");
                  setPicking("from");
                }}
                className="text-[10px] text-gray-400 transition-colors hover:text-red-500"
              >
                {t.admin.filterDateClear}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
