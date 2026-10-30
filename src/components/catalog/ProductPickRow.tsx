"use client";

import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * One product as a list row for the public order steps (mug, notebook):
 * photo on the left, full name and price on the right, check when selected.
 */
export function ProductPickRow({
  selected,
  onClick,
  image,
  name,
  price,
  extra,
}: {
  selected: boolean;
  onClick: () => void;
  /** Photo (or color fallback); rendered inside a fixed square box. */
  image: ReactNode;
  name: string;
  price?: string | null;
  /** Small badge line under the name (e.g. notebook paper kind). */
  extra?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border-2 bg-white p-2 text-left transition-colors",
        selected
          ? "border-gold ring-2 ring-gold/25 shadow-sm"
          : "border-gray-200 hover:border-gray-300",
      )}
    >
      <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-50">
        {image}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug text-gray-900">{name}</p>
        {extra ? <div className="mt-1">{extra}</div> : null}
        {price ? (
          <p className="mt-1 text-sm font-semibold tabular-nums text-gold">{price}</p>
        ) : null}
      </div>
      <span
        className={cn(
          "mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
          selected ? "border-gold bg-gold text-white" : "border-gray-300 bg-white",
        )}
        aria-hidden
      >
        {selected ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
      </span>
    </button>
  );
}

/** «Другая / своя» option as a dashed row matching {@link ProductPickRow}. */
export function OtherPickRow({
  selected,
  onClick,
  label,
  hint,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "w-full rounded-xl border-2 px-3 py-3 text-left transition-colors",
        selected
          ? "border-gold ring-2 ring-gold/25 bg-amber-50/40"
          : "border-dashed border-gray-300 bg-gray-50/80 hover:border-amber-300 hover:bg-amber-50/30",
      )}
    >
      <span className="block text-sm font-semibold text-gray-800">{label}</span>
      {hint ? <span className="mt-0.5 block text-xs text-gray-500">{hint}</span> : null}
    </button>
  );
}
