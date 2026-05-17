"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Single-value select rendered as a custom popup so it can be styled
 * consistently with the rest of the app (the native `<select>` popup is
 * rendered by the OS and can't be themed).
 *
 * Visual contract aligns with admin filters (e.g. orders status): thin gray
 * border (`border-gray-200` / hover `gray-300`), rounded-lg trigger, list
 * `border-gray-200` + `shadow-lg` — no gold ring/stack when open.
 *
 * The list renders in a `fixed` portal so wrappers with `overflow-x-auto`
 * (e.g. data tables) do not clip the menu or change row heights.
 */
export interface MenuSelectOption<TValue extends string | number> {
  value: TValue;
  label: string;
  /** Decorative preview left of label (use `alt=""` on images). Shown on the trigger when selected. */
  leading?: ReactNode;
  /** Secondary line under `label`, e.g. SKU. */
  description?: string;
}

export interface MenuSelectProps<TValue extends string | number> {
  value: TValue;
  options: ReadonlyArray<MenuSelectOption<TValue>>;
  onChange: (next: TValue) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
  ariaLabel?: string;
  buttonClassName?: string;
  leadingIcon?: ReactNode;
  /** Extra classes on the list (scroll, padding tweaks). Geometry uses inline styles. */
  listClassName?: string;
  /**
   * Minimum dropdown width (px); useful for catalog scans. Effective width respects viewport.
   */
  popoverMinWidthPx?: number;
}

export function MenuSelect<TValue extends string | number>({
  value,
  options,
  onChange,
  disabled = false,
  className,
  id,
  ariaLabel,
  buttonClassName,
  leadingIcon,
  listClassName,
  popoverMinWidthPx = 0,
}: MenuSelectProps<TValue>) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [menuStyle, setMenuStyle] = useState<
    | { vertical: "below"; left: number; top: number; width: number; maxHeight: number }
    | {
        vertical: "above";
        left: number;
        bottom: number;
        width: number;
        maxHeight: number;
      }
    | null
  >(null);
  /** Wrap for outside-click containment; positioning uses triggerRef (the button rect). */
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLUListElement>(null);
  const reactId = useId();
  const listboxId = id ?? `menusel-${reactId}`;

  const selected = useMemo(
    () => options.find((o) => o.value === value),
    [options, value],
  );

  const triggerLeading = selected?.leading ?? leadingIcon;

  const syncMenuPosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el || typeof window === "undefined") return;

    void el.offsetWidth;

    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const edge = 10;
    const gap = 6;
    const menuLimit = 352;
    const minBelow = 120;

    let width = Math.max(r.width, popoverMinWidthPx);
    width = Math.min(width, vw - edge * 2);

    const left = Math.min(Math.max(r.left, edge), vw - edge - width);

    const spaceBelowRaw = Math.max(0, vh - edge - (r.bottom + gap));
    const spaceAboveRaw = Math.max(0, r.top - gap - edge);

    /** Default: open downward; anchor list top edge to viewport. */
    let vertical: "below" | "above" = "below";
    let top: number | undefined = r.bottom + gap;
    let bottom: number | undefined;
    let maxHeight = Math.min(menuLimit, spaceBelowRaw);

    const openAbove =
      spaceBelowRaw < minBelow &&
      spaceAboveRaw > spaceBelowRaw &&
      spaceAboveRaw >= 96;

    if (openAbove) {
      const aboveMaxHeight = Math.min(menuLimit, spaceAboveRaw);
      if (aboveMaxHeight > 0) {
        vertical = "above";
        maxHeight = aboveMaxHeight;
        bottom = vh - r.top + gap;
        top = undefined;
      }
    }

    if (vertical === "below") {
      const rowTopPx = top ?? r.bottom + gap;
      top = rowTopPx;
      maxHeight = Math.min(menuLimit, Math.max(0, vh - edge - rowTopPx));
    }

    if (vertical === "above" && bottom != null) {
      setMenuStyle({
        vertical: "above",
        left,
        bottom,
        width,
        maxHeight,
      });
    } else {
      const t = top ?? r.bottom + gap;
      setMenuStyle({
        vertical: "below",
        left,
        top: t,
        width,
        maxHeight,
      });
    }
  }, [popoverMinWidthPx]);

  const close = useCallback(() => {
    setOpen(false);
    setMenuStyle(null);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- SSR: portal attaches after hydrate
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    syncMenuPosition();
    const raf = window.requestAnimationFrame(() => syncMenuPosition());
    return () => window.cancelAnimationFrame(raf);
  }, [open, syncMenuPosition, options.length]);

  useEffect(() => {
    if (open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- discard geometry whenever menu collapses (matches close())
    setMenuStyle(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const scrollOrResize = (): void => {
      syncMenuPosition();
    };
    window.addEventListener("resize", scrollOrResize);
    window.addEventListener("scroll", scrollOrResize, true);
    return () => {
      window.removeEventListener("resize", scrollOrResize);
      window.removeEventListener("scroll", scrollOrResize, true);
    };
  }, [open, syncMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent): void => {
      const node = e.target as Node | null;
      if (!node) return;
      if (
        containerRef.current?.contains(node) ||
        triggerRef.current?.contains(node) ||
        popoverRef.current?.contains(node)
      ) {
        return;
      }
      close();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const handleSelect = useCallback(
    (next: TValue) => {
      onChange(next);
      close();
    },
    [onChange, close],
  );

  const dropdown =
    mounted && typeof document !== "undefined" && open && menuStyle ? (
      <ul
        ref={popoverRef}
        id={`${listboxId}-list`}
        role="listbox"
        aria-activedescendant={
          selected ? `${listboxId}-opt-${selected.value}` : undefined
        }
        className={cn(
          "fixed z-[130] overflow-y-auto overscroll-contain rounded-lg border border-gray-200 bg-white py-1 shadow-lg text-gray-950",
          listClassName,
        )}
        style={{
          left: `${menuStyle.left}px`,
          width: `${menuStyle.width}px`,
          maxHeight: `${menuStyle.maxHeight}px`,
          ...(menuStyle.vertical === "above"
            ? { bottom: `${menuStyle.bottom}px`, top: "auto" }
            : { top: `${menuStyle.top}px`, bottom: "auto" }),
        }}
        onMouseDown={(e) => {
          /* avoid losing focus before item click resolves */
          e.preventDefault();
        }}
      >
        {options.map((opt) => {
          const isSelected = opt.value === value;
          const hasRichRow = Boolean(opt.leading || opt.description);
          return (
            <li
              key={String(opt.value)}
              id={`${listboxId}-opt-${opt.value}`}
              role="option"
              aria-selected={isSelected}
              tabIndex={-1}
              onClick={() => handleSelect(opt.value)}
              className={cn(
                "flex cursor-pointer items-center gap-2 px-3 py-2 text-sm transition-colors tabular-nums",
                isSelected
                  ? "bg-gray-100 font-medium text-gray-900"
                  : "text-gray-700 hover:bg-gray-50",
              )}
            >
              {opt.leading ? (
                <span className="shrink-0" aria-hidden="true">
                  {opt.leading}
                </span>
              ) : null}
              {hasRichRow ? (
                <div className="min-w-0 flex-1">
                  <span className="block truncate leading-snug">{opt.label}</span>
                  {opt.description ? (
                    <span className="mt-0.5 block truncate font-mono text-[11px] font-normal tracking-wide text-gray-600">
                      {opt.description}
                    </span>
                  ) : null}
                </div>
              ) : (
                <span className="min-w-0 flex-1 truncate">{opt.label}</span>
              )}
              {isSelected ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden="true" />
              ) : null}
            </li>
          );
        })}
      </ul>
    ) : null;

  return (
    <>
      <div ref={containerRef} className={cn("relative block min-w-0 w-full", className)}>
        <button
          ref={triggerRef}
          type="button"
          id={id}
          onClick={() => {
            if (disabled) return;
            setOpen((v) => !v);
          }}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? `${listboxId}-list` : undefined}
          aria-label={ariaLabel}
          className={cn(
            "flex min-h-9 w-full items-center rounded-lg border border-gray-200 bg-white px-3 py-0 text-[15px] leading-none tracking-tight text-gray-950 shadow-sm transition-colors tabular-nums",
            open
              ? "z-[40] border-gray-300"
              : "hover:border-gray-300 hover:bg-gray-50",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950",
            "disabled:cursor-not-allowed disabled:opacity-55",
            buttonClassName,
          )}
        >
          {triggerLeading ? (
            <span className="-ml-1 mr-2 flex shrink-0 items-center" aria-hidden="true">
              {triggerLeading}
            </span>
          ) : null}
          <span className="min-w-0 flex-1 truncate text-left">
            {selected?.label ?? ""}
          </span>
          <ChevronDown
            className={cn(
              "ml-2 h-4 w-4 shrink-0 text-gray-500 opacity-70 transition-transform",
              open && "rotate-180",
            )}
            aria-hidden="true"
          />
        </button>
      </div>
      {dropdown && mounted && createPortal(dropdown, document.body)}
    </>
  );
}
