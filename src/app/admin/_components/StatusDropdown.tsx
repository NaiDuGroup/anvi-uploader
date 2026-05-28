"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { useLanguageStore } from "@/stores/useLanguageStore";
import type { OrderStatus } from "@/lib/validations";
import {
  ADMIN_STATUSES,
  WORKSHOP_STATUSES,
  STATUS_VARIANT_MAP,
  STATUS_DOT_COLORS,
  TRIGGER_COLORS,
} from "@/app/admin/_lib/orderStatus";

export { ADMIN_STATUSES, WORKSHOP_STATUSES, STATUS_VARIANT_MAP, STATUS_DOT_COLORS, TRIGGER_COLORS };

export const StatusDropdown = memo(function StatusDropdown({
  order,
  t,
  isWorkshop,
  onStatusChange,
  statusTriggerTestScope,
  isSaving = false,
}: {
  order: { id: string; status: string };
  t: ReturnType<typeof useLanguageStore.getState>["t"];
  isWorkshop: boolean;
  onStatusChange: (id: string, status: string) => Promise<void>;
  /** Disambiguate main table vs workshop sidebar (same order can appear in both). */
  statusTriggerTestScope: "table" | "sidebar" | "board";
  isSaving?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const statuses = isWorkshop ? WORKSHOP_STATUSES : ADMIN_STATUSES;
  const statusKey = order.status as OrderStatus;
  const variant = STATUS_VARIANT_MAP[statusKey] ?? "outline";

  useEffect(() => {
    if (!isSaving) return;
    queueMicrotask(() => {
      setOpen(false);
    });
  }, [isSaving]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        btnRef.current && !btnRef.current.contains(target) &&
        menuRef.current && !menuRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggle = () => {
    if (isSaving) return;
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const menuHeight = statuses.length * 36 + 8;
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < menuHeight && rect.top > menuHeight) {
        setPos({ top: rect.top - menuHeight - 4, left: rect.left });
      } else {
        setPos({ top: rect.bottom + 4, left: rect.left });
      }
    }
    setOpen((v) => !v);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        disabled={isSaving}
        data-testid={`order-status-trigger-${statusTriggerTestScope}-${order.id}`}
        className={`inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-lg border py-1.5 pl-2.5 pr-3 text-left text-xs font-medium transition-colors ${
          isSaving ? "opacity-80 cursor-wait" : "cursor-pointer"
        } ${TRIGGER_COLORS[variant] ?? TRIGGER_COLORS.outline}`}
      >
        <span className={`h-2 w-2 flex-shrink-0 rounded-full ${STATUS_DOT_COLORS[order.status] ?? "bg-gray-400"}`} />
        <span className={`min-w-0 flex-1 truncate ${isSaving ? "opacity-80" : ""}`}>
          {t.statuses[statusKey] ?? order.status}
        </span>
        {isSaving ? (
          <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin opacity-80" />
        ) : (
          <ChevronDown
            className={`h-3 w-3 flex-shrink-0 opacity-50 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          />
        )}
      </button>

      {open && (
        <div
          ref={menuRef}
          style={{ top: pos.top, left: pos.left }}
          className="fixed z-50 min-w-[210px] bg-white rounded-xl border border-gray-200 shadow-lg py-1"
        >
          {statuses.map((s) => {
            const isActive = s === order.status;
            return (
              <button
                key={s}
                type="button"
                data-testid={`status-option-${s}`}
                onClick={() => {
                  setOpen(false);
                  if (s !== order.status) onStatusChange(order.id, s);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
                  isActive
                    ? "bg-gray-50 font-medium text-gray-900"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT_COLORS[s] ?? "bg-gray-400"}`} />
                <span className="flex-1">{t.statuses[s] ?? s}</span>
                {isActive && <Check className="w-3.5 h-3.5 text-amber-600" />}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
});
