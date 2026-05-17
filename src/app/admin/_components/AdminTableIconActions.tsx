import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Icon-only outline action buttons — matches `ClientsPageClient` row actions
 * (`variant="outline"` + `size="sm"`).
 */
export const adminTableOutlineIconButtonClass = "h-8 shrink-0 px-2";

/**
 * Outline action with icon + label (optional `hidden sm:inline` on the label), same row as clients.
 */
export const adminTableOutlineLabeledButtonClass =
  "h-8 gap-1 px-2 text-xs whitespace-nowrap";

type AdminTableIconActionsProps = {
  "aria-label": string;
  children: ReactNode;
  className?: string;
};

export function AdminTableIconActions({
  "aria-label": ariaLabel,
  children,
  className,
}: AdminTableIconActionsProps) {
  return (
    <div
      role="toolbar"
      aria-label={ariaLabel}
      className={cn("flex items-center justify-end gap-1", className)}
    >
      {children}
    </div>
  );
}
