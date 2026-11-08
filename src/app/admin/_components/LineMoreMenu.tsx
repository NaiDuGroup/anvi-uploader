"use client";

import { useCallback, useEffect, useId, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { FileQuestion, MoreHorizontal, Undo2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAnchoredPopover } from "@/components/ui/useAnchoredPopover";

/**
 * Per-line «⋯» overflow menu (workshop board + studio orders sidebar): keeps
 * rare actions such as «Проблема с файлом…» / «Снять отметку» out of the
 * line's main row. Click / tap opens it (no hover), Esc / outside click /
 * Tab close it, ↑ ↓ Home End move between items.
 */

export type LineMenuItemKey = "flagLayout" | "clearLayout";

/** Which items the line's «⋯» menu offers (empty → no menu at all). */
export function lineMenuItemKeys(opts: { canFlag: boolean; flagged: boolean }): LineMenuItemKey[] {
  const keys: LineMenuItemKey[] = [];
  if (opts.flagged) keys.push("clearLayout");
  else if (opts.canFlag) keys.push("flagLayout");
  return keys;
}

export interface LineMoreMenuItem {
  key: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  testId?: string;
  title?: string;
}

export const LINE_MENU_ICONS: Record<LineMenuItemKey, LucideIcon> = {
  flagLayout: FileQuestion,
  clearLayout: Undo2,
};

export function LineMoreMenu({
  items,
  label,
  testId,
  disabled = false,
  size = "md",
  className,
}: {
  items: LineMoreMenuItem[];
  /** aria-label + tooltip of the «⋯» button («Ещё действия»). */
  label: string;
  testId?: string;
  disabled?: boolean;
  /** `md` 32px (board), `sm` 28px (dense lists), `xs` 24px (line header row). */
  size?: "xs" | "sm" | "md";
  /** Extra classes on the wrapper (e.g. `ml-auto`). */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const menuId = `line-menu-${useId().replace(/:/g, "")}`;

  const close = useCallback((): void => {
    setOpen(false);
  }, []);

  const { containerRef, triggerRef, popoverRef, popoverStyle, mounted } = useAnchoredPopover({
    open,
    onClose: close,
    minWidthPx: 200,
    maxHeightPx: 280,
    contentKey: items.length,
    align: "end",
  });

  const focusItem = useCallback(
    (which: "first" | "last" | "next" | "prev"): void => {
      const root = popoverRef.current;
      if (!root) return;
      const els = Array.from(root.querySelectorAll<HTMLElement>('[role="menuitem"]'));
      if (els.length === 0) return;
      const at = els.indexOf(document.activeElement as HTMLElement);
      const idx =
        which === "first"
          ? 0
          : which === "last"
            ? els.length - 1
            : which === "next"
              ? (at + 1) % els.length
              : (at - 1 + els.length) % els.length;
      els[idx]?.focus();
    },
    [popoverRef],
  );

  // Focus the first item once the menu is placed (keyboard and screen readers land in it).
  useEffect(() => {
    if (!open || !popoverStyle) return;
    const raf = window.requestAnimationFrame(() => {
      if (!popoverRef.current?.contains(document.activeElement)) focusItem("first");
    });
    return () => window.cancelAnimationFrame(raf);
  }, [open, popoverStyle, focusItem, popoverRef]);

  if (items.length === 0) return null;

  const onMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusItem("next");
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusItem("prev");
    } else if (e.key === "Home") {
      e.preventDefault();
      focusItem("first");
    } else if (e.key === "End") {
      e.preventDefault();
      focusItem("last");
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
      triggerRef.current?.focus();
    } else if (e.key === "Tab") {
      close();
    }
  };

  const menu =
    mounted && open && popoverStyle ? (
      <div
        ref={popoverRef}
        id={menuId}
        role="menu"
        aria-label={label}
        data-testid={testId ? `${testId}-menu` : undefined}
        onKeyDown={onMenuKeyDown}
        className="fixed z-[130] flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white py-1 text-gray-800 shadow-lg"
        style={popoverStyle}
      >
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              tabIndex={-1}
              title={item.title}
              data-testid={item.testId}
              onClick={() => {
                close();
                item.onSelect();
              }}
              className="flex min-h-10 w-full items-center gap-2 px-3 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 focus:bg-gray-100 focus:outline-none"
            >
              <Icon className="h-4 w-4 shrink-0 text-gray-500" aria-hidden />
              <span className="min-w-0 flex-1">{item.label}</span>
            </button>
          );
        })}
      </div>
    ) : null;

  return (
    <>
      <div ref={containerRef} className={cn("inline-flex", className)}>
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          aria-label={label}
          title={label}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          data-testid={testId}
          onClick={() => setOpen((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && !open) {
              e.preventDefault();
              setOpen(true);
            }
          }}
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 disabled:cursor-wait disabled:opacity-60",
            size === "xs" ? "h-6 w-6 rounded-md text-gray-400" : size === "sm" ? "h-7 w-7" : "h-8 w-8",
            open && "bg-gray-100 text-gray-700",
          )}
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {menu && createPortal(menu, document.body)}
    </>
  );
}
