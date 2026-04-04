"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, ChevronDown, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { clientPickerLabel } from "@/lib/studioClient";
import { cn } from "@/lib/utils";
import { useLanguageStore } from "@/stores/useLanguageStore";

export type ClientPickerValue = {
  id: string;
  kind: string;
  phone: string | null;
  personName: string | null;
  companyName: string | null;
  companyIdno: string | null;
};

type TAdmin = ReturnType<typeof useLanguageStore.getState>["t"]["admin"];

export default function ClientPicker({
  value,
  onChange,
  t,
  disabled,
}: {
  value: ClientPickerValue | null;
  onChange: (next: ClientPickerValue | null) => void;
  t: TAdmin;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<ClientPickerValue[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  const fetchClients = useCallback(async (search: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "40");
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/admin/clients?${params}`);
      if (!res.ok) {
        setOptions([]);
        return;
      }
      const data = (await res.json()) as { clients: ClientPickerValue[] };
      setOptions(data.clients ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const tmr = setTimeout(() => fetchClients(query), 200);
    return () => clearTimeout(tmr);
  }, [open, query, fetchClients]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const display = value ? clientPickerLabel(value) : t.clientPickerNone;

  return (
    <div ref={wrapRef} className="relative">
      <label className="mb-1.5 block text-sm font-medium">{t.clientPickerLabel}</label>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm shadow-sm transition-colors",
          disabled ? "cursor-not-allowed opacity-50" : "hover:bg-gray-50",
        )}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="flex min-w-0 items-center gap-2">
          <User className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
          <span className="truncate text-gray-900">{display}</span>
        </span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-gray-400 transition-transform", open && "rotate-180")}
        />
      </button>
      {value && !disabled && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="mt-1.5 text-xs font-medium text-amber-800 hover:text-amber-950"
        >
          {t.clientPickerClear}
        </button>
      )}

      {open && !disabled && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          <div className="border-b border-gray-100 px-2 pb-2 pt-1">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.clientPickerSearch}
                className="pl-9 pr-8"
                autoFocus
              />
              {query ? (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:bg-gray-100"
                  onClick={() => setQuery("")}
                  aria-label={t.clearSearch}
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>
          <ul
            className="max-h-56 overflow-y-auto py-1"
            role="listbox"
            aria-label={t.clientPickerLabel}
          >
            {loading ? (
              <li className="px-3 py-2 text-sm text-gray-500">{t.loadingOrders}</li>
            ) : options.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-500">{t.clientPickerEmpty}</li>
            ) : (
              options.map((c) => (
                <li key={c.id} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={value?.id === c.id}
                    className="w-full px-3 py-2 text-left text-sm text-gray-800 hover:bg-amber-50"
                    onClick={() => {
                      onChange(c);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    {clientPickerLabel(c)}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
