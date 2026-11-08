"use client";

import { useEffect, useRef, useState } from "react";
import { BookMarked, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { LibrarySheet, sheetCancelClass, sheetInputClass } from "./LibrarySheet";
import { libraryFetch, libraryMetaText, type LibraryItem } from "./libraryClient";
import { LibraryThumb } from "./LibraryThumb";
import { useLanguageStore } from "@/stores/useLanguageStore";

/**
 * «Из библиотеки» in the order wizard: the order client's items first, then
 * common ones («Все клиенты» searches every owner). Picking an item reuses
 * its stored key as the row's file — nothing is copied or uploaded.
 */
export function LibraryPickerDialog({
  clientId,
  clientName,
  usedKeys,
  onPick,
  onClose,
}: {
  clientId: string | null;
  clientName: string | null;
  /** Storage keys already used by the order's rows: marked «уже в заказе», picked only after a second click. */
  usedKeys?: ReadonlySet<string>;
  onPick: (item: LibraryItem) => void;
  onClose: () => void;
}) {
  const d = useLanguageStore((s) => s.t.library);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [allOwners, setAllOwners] = useState(false);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  /** Item already in the order whose «добавить ещё раз» is showing. */
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    const tmr = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(tmr);
  }, [query]);

  useEffect(() => {
    const my = ++seq.current;
    const sp = new URLSearchParams({ limit: "100" });
    if (debounced) sp.set("search", debounced);
    if (!allOwners) sp.set("forClient", clientId ?? "");
    void libraryFetch<{ items: LibraryItem[] }>(`/api/admin/library?${sp}`).then((res) => {
      if (my !== seq.current) return;
      setLoading(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setError(null);
      setItems(res.data.items);
    });
  }, [debounced, allOwners, clientId]);

  const own = allOwners ? [] : items.filter((i) => clientId && i.clientId === clientId);
  const rest = allOwners ? items : items.filter((i) => !(clientId && i.clientId === clientId));

  const row = (item: LibraryItem) => {
    const inOrder = usedKeys?.has(item.storageKey) ?? false;
    const confirming = inOrder && confirmId === item.id;
    return (
    <li key={item.id}>
      <button
        type="button"
        onClick={() => (inOrder && !confirming ? setConfirmId(item.id) : onPick(item))}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg border p-2 text-left transition-colors hover:border-amber-300 hover:bg-amber-50/50",
          inOrder ? "border-emerald-200 bg-emerald-50/40" : "border-gray-200",
        )}
        title={inOrder ? d.inOrderTitle : undefined}
        data-testid="library-picker-item"
        data-in-order={inOrder ? "1" : undefined}
      >
        <LibraryThumb item={item} className="h-14 w-14 shrink-0 rounded-md border border-gray-100" />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-gray-900">{item.title}</span>
            {inOrder ? (
              <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-px text-[10px] font-semibold text-emerald-800" data-testid="library-picker-in-order">
                {d.inOrder}
              </span>
            ) : null}
          </span>
          <span className="block truncate text-xs text-gray-500">
            {item.clientId ? (item.clientName ?? d.clientFallback) : d.common}
            {item.tags.length ? ` · ${item.tags.map((t) => `#${t}`).join(" ")}` : ""}
          </span>
          <span className="block truncate text-[11px] text-gray-400">
            {[libraryMetaText(item, d.meta), item.useCount ? d.usesShort(item.useCount) : ""].filter(Boolean).join(" · ")}
          </span>
          {confirming ? (
            <span className="mt-1 block text-xs font-semibold text-amber-800" data-testid="library-picker-add-again">
              {d.inOrderTitle} →
            </span>
          ) : null}
        </span>
      </button>
    </li>
    );
  };

  return (
    <LibrarySheet
      title={d.pickerTitle}
      icon={<BookMarked className="h-5 w-5 shrink-0 text-amber-600" aria-hidden />}
      onClose={onClose}
      wide
      testId="library-picker"
      footer={
        <button type="button" className={sheetCancelClass} onClick={onClose}>
          {d.cancel}
        </button>
      }
    >
      <div className="sticky top-0 z-10 -mx-1 space-y-2 bg-white px-1 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
          <input
            type="search"
            className={cn(sheetInputClass, "pl-9")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={d.pickerSearch}
            autoFocus
          />
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-gray-600">
          <input type="checkbox" className="size-4 accent-amber-600" checked={allOwners} onChange={(e) => setAllOwners(e.target.checked)} />
          {d.pickerAllClients(Boolean(clientId))}
        </label>
      </div>
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      ) : error ? (
        <p className="py-4 text-sm text-red-700">{error}</p>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">
          {debounced ? d.pickerNothing : d.pickerEmpty}
        </p>
      ) : (
        <div className="space-y-3">
          {own.length > 0 ? (
            <section>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                {d.pickerClientSection(clientName)}
              </h3>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">{own.map(row)}</ul>
            </section>
          ) : null}
          {rest.length > 0 ? (
            <section>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                {allOwners ? d.pickerAll : d.pickerCommon}
              </h3>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">{rest.map(row)}</ul>
            </section>
          ) : null}
        </div>
      )}
    </LibrarySheet>
  );
}
