"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import type { DtfPlacement } from "@/lib/dtf/dtfConstants";
import { dtfPlacementAvailable, GARMENT_SILHOUETTES, type GarmentSilhouette } from "@/lib/dtf/dtfZones";
import type { TranslationDictionary } from "@/lib/i18n/types";
import { useAnchoredPopover } from "@/components/ui/useAnchoredPopover";
import { cn } from "@/lib/utils";
import { GarmentZoneSchema } from "./GarmentZoneSchema";

const FRONT_ZONES: readonly DtfPlacement[] = [
  "front",
  "front_mid",
  "chest_center",
  "chest_across",
  "chest_right",
  "chest_left",
  "sleeve_right",
  "sleeve_left",
];
const BACK_ZONES: readonly DtfPlacement[] = ["back", "back_mid", "nape"];

export interface GarmentZonePickerProps {
  value: DtfPlacement;
  onChange: (next: DtfPlacement) => void;
  silhouette: GarmentSilhouette;
  /** T-shirt / polo switch; omit when the garment already tells. */
  onSilhouetteChange?: (next: GarmentSilhouette) => void;
  /** Zones other rows of the line already print on. */
  taken?: ReadonlySet<DtfPlacement>;
  t: TranslationDictionary;
}

/** Grid of garment pictures, one per print zone; «other» as a plain button. */
export function GarmentZonePicker({
  value,
  onChange,
  silhouette,
  onSilhouetteChange,
  taken,
  t,
}: GarmentZonePickerProps) {
  const e = t.dtf.editor;

  function tile(p: DtfPlacement) {
    const available: boolean = dtfPlacementAvailable(p, silhouette);
    const isTaken: boolean = taken?.has(p) === true && p !== value;
    const selected: boolean = p === value;
    const reason: string | null = !available ? e.poloBlocked : isTaken ? e.zoneTaken : null;
    const label: string = t.dtf.placements[p];
    return (
      <button
        key={p}
        type="button"
        aria-pressed={selected}
        aria-label={reason ? `${label} — ${reason}` : label}
        title={reason ? `${label} — ${reason}` : label}
        disabled={!available || isTaken}
        onClick={() => onChange(p)}
        className={cn(
          "flex min-w-0 flex-col items-center gap-0.5 rounded-lg border px-0.5 pb-1 pt-1.5 text-center transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500",
          selected
            ? "border-fuchsia-500 bg-fuchsia-50 text-fuchsia-900 ring-1 ring-fuchsia-500"
            : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50",
          "disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-gray-200 disabled:hover:bg-white",
        )}
      >
        <GarmentZoneSchema
          placement={p}
          silhouette={silhouette}
          muted={!available || isTaken}
          className="h-11 w-11"
        />
        <span className="line-clamp-2 w-full break-words text-[11px] font-medium leading-tight">
          {t.dtf.placementTiles[p] ?? label}
        </span>
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 text-[13px]">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <p className="text-[11px] text-gray-500">{e.sideHint}</p>
        {onSilhouetteChange && (
          <div className="inline-flex rounded-lg bg-gray-100 p-0.5" role="radiogroup" aria-label={e.silhouette}>
            {GARMENT_SILHOUETTES.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={silhouette === s}
                className={cn(
                  "rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors",
                  silhouette === s
                    ? "bg-white text-gray-900 shadow-sm ring-1 ring-gray-200"
                    : "text-gray-500 hover:text-gray-800",
                )}
                onClick={() => onSilhouetteChange(s)}
              >
                {t.dtf.silhouettes[s]}
              </button>
            ))}
          </div>
        )}
      </div>
      <section aria-label={e.viewFront}>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{e.viewFront}</p>
        <div className="grid grid-cols-4 gap-1.5">{FRONT_ZONES.map(tile)}</div>
      </section>
      <section aria-label={e.viewBack}>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{e.viewBack}</p>
        <div className="grid grid-cols-4 gap-1.5">{BACK_ZONES.map(tile)}</div>
      </section>
      <button
        type="button"
        aria-pressed={value === "other"}
        onClick={() => onChange("other")}
        className={cn(
          "w-fit rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500",
          value === "other"
            ? "border-fuchsia-500 bg-fuchsia-50 text-fuchsia-900"
            : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50",
        )}
      >
        {t.dtf.placements.other}
      </button>
    </div>
  );
}

/** Compact zone field for a dense row: mini picture + name, the picker in a popover. */
export function GarmentZoneSelect({
  className,
  ...picker
}: GarmentZonePickerProps & { className?: string }) {
  const { value, silhouette, t } = picker;
  const [open, setOpen] = useState<boolean>(false);
  const close = (): void => setOpen(false);
  const { containerRef, triggerRef, popoverRef, popoverStyle, mounted } = useAnchoredPopover({
    open,
    onClose: close,
    minWidthPx: 340,
    maxHeightPx: 560,
    contentKey: silhouette,
  });
  const unavailable: boolean = !dtfPlacementAvailable(value, silhouette);
  const label: string = t.dtf.placements[value];

  return (
    <div ref={containerRef} className={cn("relative min-w-0", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${t.dtf.editor.placement}: ${label}`}
        title={unavailable ? `${label} — ${t.dtf.editor.poloBlocked}` : label}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex min-h-8 w-full items-center gap-1.5 rounded-lg border bg-white py-0.5 pl-1 pr-2 text-[13px] leading-none text-gray-950 shadow-sm transition-colors",
          unavailable ? "border-amber-400 bg-amber-50" : "border-gray-200",
          open ? "border-gray-300" : "hover:border-gray-300 hover:bg-gray-50",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950",
        )}
      >
        <GarmentZoneSchema placement={value} silhouette={silhouette} className="h-7 w-7" />
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-gray-500 opacity-70 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {mounted &&
        open &&
        popoverStyle &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label={t.dtf.editor.placement}
            className="fixed z-[130] overflow-y-auto overscroll-contain rounded-lg border border-gray-200 bg-white p-2.5 text-gray-950 shadow-lg"
            style={popoverStyle}
          >
            <GarmentZonePicker
              {...picker}
              onChange={(next) => {
                picker.onChange(next);
                close();
              }}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
