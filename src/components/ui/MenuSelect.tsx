"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Single-value select rendered as a custom popup so it can be styled
 * consistently with the rest of the app (the native `<select>` popup is
 * rendered by the OS and can't be themed).
 *
 * Visual contract: matches `<Input />` when closed (h-9, gray-200 border,
 * white background, gray-950 focus ring). Menu mirrors `LanguageSwitcher`.
 */
export interface MenuSelectOption<TValue extends string | number> {
  value: TValue;
  label: string;
}

export interface MenuSelectProps<TValue extends string | number> {
  value: TValue;
  options: ReadonlyArray<MenuSelectOption<TValue>>;
  onChange: (next: TValue) => void;
  disabled?: boolean;
  className?: string;
  /** Accessible name. Pair with `<label>` via `htmlFor` and pass `id` here. */
  id?: string;
  ariaLabel?: string;
  /** Merged onto the trigger button (e.g. height/radius next to neighbouring inputs). */
  buttonClassName?: string;
  /** Optional leading element (icon, badge…) rendered before the label. */
  leadingIcon?: React.ReactNode;
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
}: MenuSelectProps<TValue>) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const reactId = useId();
  const listboxId = id ?? `menusel-${reactId}`;

  const selected = useMemo(
    () => options.find((o) => o.value === value),
    [options, value],
  );

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        close();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
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

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        id={id}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${listboxId}-list` : undefined}
        aria-label={ariaLabel}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-md border border-gray-200 bg-white pl-3 pr-2.5 py-1 text-base text-gray-900 shadow-sm transition-colors tabular-nums",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950",
          "disabled:cursor-not-allowed disabled:opacity-50",
          !disabled && "hover:bg-gray-50",
          buttonClassName,
        )}
      >
        {leadingIcon ? (
          <span className="mr-1.5 flex shrink-0 items-center" aria-hidden="true">
            {leadingIcon}
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate text-left">
          {selected?.label ?? ""}
        </span>
        <ChevronDown
          className={cn(
            "ml-2 h-4 w-4 shrink-0 text-gray-500 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>

      {open && (
        <ul
          id={`${listboxId}-list`}
          role="listbox"
          aria-activedescendant={
            selected ? `${listboxId}-opt-${selected.value}` : undefined
          }
          className="absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <li
                key={String(opt.value)}
                id={`${listboxId}-opt-${opt.value}`}
                role="option"
                aria-selected={isSelected}
                onClick={() => handleSelect(opt.value)}
                className={cn(
                  "flex cursor-pointer items-center justify-between px-3 py-2 text-sm tabular-nums transition-colors",
                  isSelected
                    ? "bg-gray-100 font-medium text-gray-900"
                    : "text-gray-700 hover:bg-gray-50",
                )}
              >
                <span>{opt.label}</span>
                {isSelected && (
                  <Check className="h-3.5 w-3.5 text-gray-500" aria-hidden="true" />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
