"use client";

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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

export interface DatePickerProps {
  /** ISO date string `YYYY-MM-DD`, or `""` for empty. */
  value: string;
  onChange: (next: string) => void;
  locale: string;
  t: ReturnType<typeof useLanguageStore.getState>["t"];
  placeholder?: string;
  /** Allow clearing the selected date with an `×` button. Defaults to `true`. */
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
  ariaLabel?: string;
}

/**
 * Single-date picker matching the look of {@link DateRangeFilter} (used on the
 * Orders / Invoices list pages). Renders as a form-sized trigger button with a
 * popover calendar; weeks start on Monday and respect the user's locale.
 */
export const DatePicker = memo(function DatePicker({
  value,
  onChange,
  locale,
  t,
  placeholder,
  clearable = true,
  disabled = false,
  className,
  id,
  ariaLabel,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const hasValue = !!value;

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  /**
   * Decide whether to flip the popover upward so it never spills below the
   * viewport (which is what makes the page "grow" and a scrollbar appear when
   * the trigger sits near the bottom of a long form).
   */
  const computeOpenUpward = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return false;
    const rect = wrap.getBoundingClientRect();
    const gap = 8;
    const needed = popoverRef.current?.offsetHeight ?? 296;
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    if (spaceBelow >= needed) return false;
    if (spaceAbove >= needed) return true;
    return spaceAbove > spaceBelow;
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    setOpenUpward(computeOpenUpward());
  }, [open, computeOpenUpward]);

  useEffect(() => {
    if (!open) return;
    const onReposition = () => setOpenUpward(computeOpenUpward());
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, computeOpenUpward]);

  useEffect(() => {
    if (!open) return;
    const ref = value || toIso(today);
    const [y, m] = ref.split("-").map(Number);
    setViewYear(y);
    setViewMonth(m - 1);
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

  const placeholderLabel = placeholder ?? t.admin.filterByDate;
  const label = hasValue ? fmtShort(value) : placeholderLabel;

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <button
        type="button"
        id={id}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={cn(
          "flex h-9 w-full cursor-pointer items-center justify-between gap-2 rounded-md border bg-white px-3 py-1 text-sm shadow-sm transition-colors tabular-nums",
          hasValue
            ? "border-gray-200 text-gray-900"
            : "border-gray-200 text-gray-500",
          !disabled && "hover:bg-gray-50",
          disabled && "cursor-not-allowed opacity-50",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950",
        )}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <CalendarDays className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
          <span className="truncate">{label}</span>
        </span>
        {clearable && hasValue && !disabled ? (
          <span
            role="button"
            tabIndex={0}
            aria-label={t.admin.filterDateClear}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onChange("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onChange("");
              }
            }}
            className="-mr-1 cursor-pointer rounded p-0.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        ) : (
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-gray-400 transition-transform",
              open && "rotate-180",
            )}
            aria-hidden
          />
        )}
      </button>

      {open && !disabled && (
        <div
          ref={popoverRef}
          role="dialog"
          className={cn(
            "absolute left-0 z-50 w-[280px] select-none rounded-xl border border-gray-200 bg-white p-3 shadow-lg",
            openUpward ? "bottom-full mb-1" : "top-full mt-1",
          )}
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={prevMonth}
              className="rounded-md p-1 text-gray-500 transition-colors hover:bg-gray-100"
              aria-label="Prev month"
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
              aria-label="Next month"
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
              const isSelected = iso === value;
              const isToday = iso === toIso(today);

              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => {
                    onChange(iso);
                    setOpen(false);
                  }}
                  className={cn(
                    "relative h-8 rounded-md text-xs transition-colors",
                    isSelected
                      ? "bg-amber-500 font-bold text-white"
                      : isToday
                        ? "font-bold text-amber-600 hover:bg-amber-50"
                        : "text-gray-700 hover:bg-gray-100",
                  )}
                  aria-pressed={isSelected}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>

          {clearable && hasValue ? (
            <div className="mt-2 flex items-center justify-end">
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                className="text-[10px] text-gray-400 transition-colors hover:text-red-500"
              >
                {t.admin.filterDateClear}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
});
