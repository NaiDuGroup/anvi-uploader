"use client";

import { useRef, useState } from "react";
import { ImageIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatAmountInput } from "@/lib/money";

/** Small presentational pieces shared by the unified stock screens. */

export function moneyCell(value: number | null): string {
  return value == null ? "—" : formatAmountInput(value);
}

export function ActiveToggle({
  isActive,
  busy,
  disabled,
  label,
  onToggle,
}: {
  isActive: boolean;
  busy: boolean;
  disabled: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isActive}
      aria-label={label}
      title={label}
      disabled={disabled || busy}
      onClick={onToggle}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full outline-none ring-1 ring-inset transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2",
        isActive
          ? "bg-emerald-500 ring-emerald-600/30 hover:bg-emerald-600"
          : "bg-slate-300 ring-slate-400/40 hover:bg-slate-400",
        (disabled || busy) && "cursor-not-allowed opacity-60",
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow ring-1 ring-black/5 transition-transform duration-200",
          isActive ? "translate-x-[22px]" : "translate-x-0.5",
        )}
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin text-gray-500" /> : null}
      </span>
    </button>
  );
}

export function ColorSwatch({ hex, title }: { hex: string | undefined; title?: string }) {
  if (!hex) return null;
  return (
    <span
      className="inline-block h-4 w-4 shrink-0 rounded-full border border-gray-300 align-middle"
      style={{ backgroundColor: hex }}
      title={title}
      aria-hidden
    />
  );
}

export function ItemPhoto({ url, size = "md" }: { url: string | null; size?: "sm" | "md" }) {
  const box: string = size === "sm" ? "h-12 w-12" : "h-14 w-14";
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className={cn(box, "shrink-0 rounded-lg border border-gray-200 bg-gray-50 object-contain p-0.5")}
      />
    );
  }
  return (
    <div className={cn(box, "flex shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-300")}>
      <ImageIcon className="h-5 w-5" aria-hidden />
    </div>
  );
}

export function PhotoDropzone({
  disabled,
  publicUrl,
  dropLabel,
  onPickFile,
}: {
  disabled: boolean;
  publicUrl: string | null;
  dropLabel: string;
  onPickFile: (f: File) => void;
}) {
  const [over, setOver] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(f: File | undefined): void {
    if (!f || !f.type.startsWith("image/")) return;
    onPickFile(f);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      className={cn(
        "relative flex min-h-[180px] cursor-pointer select-none flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-3 py-5 text-center text-xs text-gray-600 transition-colors lg:aspect-square lg:min-h-0 lg:max-h-[280px]",
        over ? "border-amber-400 bg-amber-50/60" : "border-gray-200 bg-gray-50/40 hover:border-gray-300",
        disabled && "pointer-events-none cursor-not-allowed opacity-50",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) handleFile(e.dataTransfer.files?.[0]);
      }}
      onClick={() => !disabled && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {publicUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={publicUrl} alt="" className="max-h-40 w-full max-w-[200px] rounded-lg border border-gray-200 object-contain" />
      ) : (
        <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-gray-200/80 text-gray-400">
          <ImageIcon className="h-6 w-6" aria-hidden />
        </div>
      )}
      <span>{dropLabel}</span>
    </div>
  );
}

export const fieldLabelCls = "block text-xs font-medium text-gray-600";
