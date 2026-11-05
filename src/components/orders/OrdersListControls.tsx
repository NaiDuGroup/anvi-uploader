"use client";

/**
 * Orders list pagination (page / pages (total) · rows-per-page · prev/next)
 * and sortable table header. Shared by the staff orders table and the
 * customer cabinet orders list so both behave the same.
 */

import React, {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ORDER_PAGE_SIZE_OPTIONS } from "@/lib/orderPagination";
import type { OrderPageSize } from "@/lib/orderPagination";
import { cn } from "@/lib/utils";

/** ~px per option row + vertical padding on the list panel */
function estimatePageSizeMenuHeight(optionCount: number): number {
  return optionCount * 36 + 10;
}

export const OrdersPageSizeSelect = memo(function OrdersPageSizeSelect({
  value,
  onChange,
  disabled,
  ariaLabel,
}: {
  value: OrderPageSize;
  onChange: (size: OrderPageSize) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const computeOpenUpward = useCallback(() => {
    const wrap = wrapRef.current;
    const menu = menuRef.current;
    if (!wrap) return false;
    const rect = wrap.getBoundingClientRect();
    const gap = 8;
    const needed =
      menu?.offsetHeight ?? estimatePageSizeMenuHeight(ORDER_PAGE_SIZE_OPTIONS.length);
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    if (spaceBelow >= needed) return false;
    if (spaceAbove >= needed) return true;
    return spaceAbove > spaceBelow;
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    // Synchronously measuring layout and adjusting popover direction is the
    // intended use of useLayoutEffect; the lint rule's blanket warning doesn't
    // apply here because we have no external system to observe.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggleOpen = () => {
    if (disabled) return;
    if (open) {
      setOpen(false);
      return;
    }
    const el = wrapRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      const gap = 8;
      const needed = estimatePageSizeMenuHeight(ORDER_PAGE_SIZE_OPTIONS.length);
      const spaceBelow = window.innerHeight - rect.bottom - gap;
      const spaceAbove = rect.top - gap;
      const upward =
        spaceBelow < needed &&
        (spaceAbove >= needed || spaceAbove > spaceBelow);
      setOpenUpward(upward);
    }
    setOpen(true);
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={toggleOpen}
        className={cn(
          "inline-flex items-center justify-between gap-2 min-w-[5.25rem] rounded-lg border border-gray-300 bg-white pl-2.5 pr-2 py-[7px] text-xs font-medium text-gray-600 shadow-sm transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950 disabled:cursor-not-allowed disabled:opacity-50",
          !disabled && "cursor-pointer",
        )}
      >
        <span className="tabular-nums">{value}</span>
        <ChevronDown
          className={cn(
            "h-3 w-3 flex-shrink-0 opacity-50 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open && !disabled && (
        <div
          ref={menuRef}
          className={cn(
            "absolute right-0 z-50 min-w-full rounded-lg border border-gray-200 bg-white py-1 shadow-lg",
            openUpward ? "bottom-full mb-1" : "top-full mt-1",
          )}
          role="listbox"
          aria-label={ariaLabel}
        >
          {ORDER_PAGE_SIZE_OPTIONS.map((n) => {
            const active = n === value;
            return (
              <button
                key={n}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(n);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors",
                  active
                    ? "bg-amber-50 text-amber-900"
                    : "text-gray-700 hover:bg-gray-50",
                )}
              >
                <span className="min-w-[1.75rem] tabular-nums font-medium">{n}</span>
                <span className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center">
                  {active ? (
                    <Check className="h-3.5 w-3.5 text-amber-600" aria-hidden />
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});

export function OrdersPaginationBar({
  page,
  pageSize,
  totalPages,
  totalCount,
  loading,
  t,
  setPage,
  setPageSize,
}: {
  page: number;
  pageSize: OrderPageSize;
  totalPages: number;
  totalCount: number;
  loading: boolean;
  /** Only these labels are read (shared by staff and cabinet lists). */
  t: { admin: { rowsPerPage: string }; common: { prevPage: string; nextPage: string } };
  setPage: (p: number) => void;
  setPageSize: (size: OrderPageSize) => void;
}) {
  if (totalCount <= 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mt-4 px-1">
      <span className="text-sm text-gray-500">
        {page} / {totalPages} ({totalCount})
      </span>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <span className="whitespace-nowrap">{t.admin.rowsPerPage}</span>
          <OrdersPageSizeSelect
            value={pageSize}
            onChange={setPageSize}
            disabled={loading}
            ariaLabel={t.admin.rowsPerPage}
          />
        </label>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(page - 1)} disabled={loading || page <= 1} aria-label={t.common.prevPage} title={t.common.prevPage}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium tabular-nums min-w-[3ch] text-center">{page}</span>
            <Button variant="outline" size="sm" onClick={() => setPage(page + 1)} disabled={loading || page >= totalPages} aria-label={t.common.nextPage} title={t.common.nextPage}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}


export type SortDir = "asc" | "desc";

/** Clickable `<th>` with the ↑ / ↓ / ⇅ indicator used by the orders tables. */
export function SortableTh<C extends string | null>({
  col,
  current,
  dir,
  onSort,
  className,
  children,
}: {
  col: C;
  current: C | null;
  dir: SortDir;
  onSort: (col: C) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const active = current === col;
  return (
    <th
      className={cn(
        "px-3 py-3 cursor-pointer select-none hover:text-gray-700 transition-colors",
        className,
      )}
      onClick={() => onSort(col)}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {active ? (
          dir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-30" />
        )}
      </span>
    </th>
  );
}
