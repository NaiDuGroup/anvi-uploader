"use client";

import { AlignJustify, CalendarDays, Grid3x3 } from "lucide-react";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { cn } from "@/lib/utils";
import {
  type NotebookPaperKind,
  coerceNotebookPaperKind,
} from "@/lib/notebook/notebookPaperKind";

export type NotebookPaperKindBadgeSize = "xs" | "sm" | "md";

export interface NotebookPaperKindBadgeProps {
  kind: NotebookPaperKind | string | null | undefined;
  size?: NotebookPaperKindBadgeSize;
  /** Hide the textual label (icon-only). Defaults to false. */
  iconOnly?: boolean;
  className?: string;
}

const KIND_STYLES: Record<
  NotebookPaperKind,
  { bg: string; text: string; ring: string; icon: typeof AlignJustify }
> = {
  ruled: {
    bg: "bg-sky-100",
    text: "text-sky-800",
    ring: "ring-sky-200",
    icon: AlignJustify,
  },
  squared: {
    bg: "bg-indigo-100",
    text: "text-indigo-800",
    ring: "ring-indigo-200",
    icon: Grid3x3,
  },
  dated: {
    bg: "bg-rose-100",
    text: "text-rose-800",
    ring: "ring-rose-200",
    icon: CalendarDays,
  },
};

const SIZE_STYLES: Record<
  NotebookPaperKindBadgeSize,
  { pill: string; pillIconOnly: string; icon: string; label: string }
> = {
  xs: {
    pill: "h-5 gap-1 px-1.5 text-[10px]",
    pillIconOnly: "h-5 w-5",
    icon: "h-3 w-3",
    label: "leading-none",
  },
  sm: {
    pill: "h-6 gap-1 px-2 text-[11px]",
    pillIconOnly: "h-6 w-6",
    icon: "h-3.5 w-3.5",
    label: "leading-none",
  },
  md: {
    pill: "h-7 gap-1.5 px-2.5 text-xs",
    pillIconOnly: "h-7 w-7",
    icon: "h-4 w-4",
    label: "leading-none",
  },
};

export function notebookPaperKindLabel(
  kind: NotebookPaperKind,
  t: ReturnType<typeof useLanguageStore.getState>["t"],
): string {
  switch (kind) {
    case "squared":
      return t.admin.notebookPaperKindSquared;
    case "dated":
      return t.admin.notebookPaperKindDated;
    case "ruled":
    default:
      return t.admin.notebookPaperKindRuled;
  }
}

export function NotebookPaperKindBadge({
  kind,
  size = "sm",
  iconOnly = false,
  className,
}: NotebookPaperKindBadgeProps) {
  const t = useLanguageStore((s) => s.t);
  const safeKind = coerceNotebookPaperKind(kind);
  const styles = KIND_STYLES[safeKind];
  const sz = SIZE_STYLES[size];
  const Icon = styles.icon;
  const label = notebookPaperKindLabel(safeKind, t);

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-full font-semibold ring-1 ring-inset",
        styles.bg,
        styles.text,
        styles.ring,
        iconOnly ? sz.pillIconOnly : sz.pill,
        className,
      )}
      title={label}
      aria-label={label}
    >
      <Icon className={cn(sz.icon, "shrink-0")} aria-hidden />
      {iconOnly ? null : <span className={sz.label}>{label}</span>}
    </span>
  );
}
