"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, ArchiveRestore, BookMarked, Download, Loader2, Pencil, Search, Trash2, X } from "lucide-react";
import ClientPicker, { type ClientPickerValue } from "@/app/admin/_components/ClientPicker";
import { AdminConfirmDialog } from "@/app/admin/_components/AdminConfirmDialog";
import { EditLibraryItemDialog } from "@/app/admin/_components/library/EditLibraryItemDialog";
import { LibraryThumb } from "@/app/admin/_components/library/LibraryThumb";
import {
  libraryFetch,
  libraryFileUrl,
  libraryMetaText,
  type LibraryItem,
} from "@/app/admin/_components/library/libraryClient";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { cn } from "@/lib/utils";

type OwnerFilter = "all" | "common" | "client";

const PAGE_SIZE = 48;

function usesText(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word = mod10 === 1 && mod100 !== 11 ? "раз" : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? "раза" : "раз";
  return n === 0 ? "ещё не использован" : `использован ${n} ${word}`;
}

/**
 * «Библиотека макетов»: artwork staff saved on purpose from orders. Copies
 * live under `library/` (not deleted after 7 days like `uploads/`) and new
 * orders reuse them from the wizard («Из библиотеки»).
 */
export default function LibraryPageClient({ focusItemId }: { focusItemId: string | null }) {
  const { t } = useLanguageStore();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [owner, setOwner] = useState<OwnerFilter>("all");
  const [client, setClient] = useState<ClientPickerValue | null>(null);
  const [archived, setArchived] = useState(false);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<LibraryItem | null>(null);
  const [deleting, setDeleting] = useState<LibraryItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const reqSeq = useRef(0);

  useEffect(() => {
    const tmr = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(tmr);
  }, [query]);

  const load = useCallback(
    async (nextPage: number, append: boolean) => {
      const seq = ++reqSeq.current;
      setLoading(true);
      setError(null);
      const sp = new URLSearchParams({ page: String(nextPage), limit: String(PAGE_SIZE) });
      if (debounced) sp.set("search", debounced);
      if (owner === "common") sp.set("owner", "common");
      if (owner === "client" && client) sp.set("owner", client.id);
      if (archived) sp.set("archived", "1");
      const res = await libraryFetch<{ items: LibraryItem[]; total: number }>(`/api/admin/library?${sp}`);
      if (seq !== reqSeq.current) return;
      setLoading(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTotal(res.data.total);
      setPage(nextPage);
      setItems((prev) => (append ? [...prev, ...res.data.items.filter((i) => !prev.some((p) => p.id === i.id))] : res.data.items));
    },
    [debounced, owner, client, archived],
  );

  useEffect(() => {
    if (owner === "client" && !client) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refetch when the filters change
    void load(1, false);
  }, [load, owner, client]);

  // `?item=<id>` (from an order's «В библиотеке» badge): open that item.
  const focusDone = useRef(false);
  useEffect(() => {
    if (!focusItemId || focusDone.current) return;
    focusDone.current = true;
    void libraryFetch<{ item: LibraryItem }>(`/api/admin/library/${focusItemId}`).then((res) => {
      if (res.ok) setEditing(res.data.item);
    });
  }, [focusItemId]);

  const replaceItem = (next: LibraryItem) =>
    setItems((prev) => prev.map((i) => (i.id === next.id ? next : i)));

  const setArchivedFlag = async (item: LibraryItem, value: boolean) => {
    setRowBusy(item.id);
    const res = await libraryFetch<{ item: LibraryItem }>(`/api/admin/library/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ archived: value }),
    });
    setRowBusy(null);
    if (!res.ok) {
      setNotice(res.error);
      return;
    }
    // It leaves the current view (active ↔ archive).
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    setTotal((n) => Math.max(0, n - 1));
    setNotice(value ? `«${item.title}» — в архиве` : `«${item.title}» — восстановлен`);
  };

  const hardDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    const res = await libraryFetch<{ ok: true }>(`/api/admin/library/${deleting.id}`, { method: "DELETE" });
    setDeleteBusy(false);
    if (!res.ok) {
      setNotice(res.error);
      setDeleting(null);
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== deleting.id));
    setTotal((n) => Math.max(0, n - 1));
    setNotice(`«${deleting.title}» удалён`);
    setDeleting(null);
  };

  const filterBtn = (value: OwnerFilter, label: string) => (
    <button
      type="button"
      onClick={() => setOwner(value)}
      className={cn(
        "h-9 rounded-lg px-3 text-sm font-medium transition-colors",
        owner === value ? "bg-amber-600 text-white shadow-sm" : "bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50",
      )}
      aria-pressed={owner === value}
    >
      {label}
    </button>
  );

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900 sm:text-2xl">
            <BookMarked className="h-6 w-6 text-amber-600" aria-hidden />
            Библиотека макетов
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Повторяющиеся макеты клиентов и общие. Не удаляются через 7 дней, как файлы заказов. Сохранить файл —
            кнопка «В библиотеку» у файла в заказе; использовать — «Из библиотеки» в новом заказе.
          </p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" className="size-4 accent-amber-600" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
          Архив
        </label>
      </div>

      <div className="mb-4 space-y-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Название, тег, клиент или телефон"
            className="h-10 w-full rounded-lg border border-gray-300 pl-9 pr-9 text-sm text-gray-900 placeholder:text-gray-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200"
            aria-label="Поиск по библиотеке"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-gray-400 hover:bg-gray-100"
              aria-label="Очистить"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {filterBtn("all", "Все")}
          {filterBtn("common", "Общие")}
          {filterBtn("client", "Клиент")}
          {owner === "client" ? (
            <div className="w-full sm:w-80">
              <ClientPicker value={client} onChange={setClient} t={t.admin} />
            </div>
          ) : null}
        </div>
      </div>

      {notice ? (
        <div className="mb-3 flex items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="shrink-0 text-amber-800" aria-label="Закрыть">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}
      {error ? <p className="mb-3 text-sm text-red-700">{error}</p> : null}

      {owner === "client" && !client ? (
        <p className="py-10 text-center text-sm text-gray-500">Выберите клиента.</p>
      ) : !loading && items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white py-12 text-center text-sm text-gray-500">
          {archived
            ? "В архиве пусто."
            : debounced
              ? "Ничего не найдено."
              : "Библиотека пока пустая. Откройте заказ и нажмите «В библиотеку» у файла."}
        </div>
      ) : (
        <>
          <p className="mb-2 text-xs text-gray-500">Найдено: {total}</p>
          <ul className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" data-testid="library-grid">
            {items.map((item) => (
              <li key={item.id} className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <a href={libraryFileUrl(item.id)} target="_blank" rel="noopener noreferrer" className="block" title="Открыть файл">
                  <LibraryThumb item={item} className="aspect-[4/3] w-full border-b border-gray-100" />
                </a>
                <div className="flex flex-1 flex-col gap-1.5 p-3">
                  <p className="line-clamp-2 text-sm font-semibold text-gray-900" title={item.title}>
                    {item.title}
                  </p>
                  <p className="truncate text-xs text-gray-500" title={item.fileName}>
                    {item.fileName}
                  </p>
                  <div className="flex flex-wrap items-center gap-1">
                    <span
                      className={cn(
                        "max-w-full truncate rounded px-1.5 py-0.5 text-[11px] font-medium",
                        item.clientId ? "bg-blue-50 text-blue-800" : "bg-gray-100 text-gray-700",
                      )}
                      title={item.clientId ? `${item.clientName ?? "Клиент"} ${item.clientPhone ?? ""}` : "Общий"}
                    >
                      {item.clientId ? (item.clientName ?? item.clientPhone ?? "Клиент") : "Общий"}
                    </span>
                    {item.tags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setQuery(tag)}
                        className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800 hover:bg-amber-100"
                      >
                        #{tag}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-500">{libraryMetaText(item) || "—"}</p>
                  <p className="text-[11px] text-gray-500">
                    {usesText(item.useCount)}
                    {item.sourceOrderNumber ? ` · из заказа #${String(item.sourceOrderNumber).padStart(4, "0")}` : null}
                  </p>
                  <div className="mt-auto flex flex-wrap items-center gap-1 pt-1">
                    <a
                      href={libraryFileUrl(item.id, true)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-blue-600"
                      title="Скачать"
                      aria-label="Скачать"
                    >
                      <Download className="h-4 w-4" />
                    </a>
                    <button
                      type="button"
                      onClick={() => setEditing(item)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-amber-700"
                      title="Изменить"
                      aria-label="Изменить"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void setArchivedFlag(item, !archived)}
                      disabled={rowBusy === item.id}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-50"
                      title={archived ? "Восстановить" : "В архив"}
                      aria-label={archived ? "Восстановить" : "В архив"}
                    >
                      {rowBusy === item.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : archived ? (
                        <ArchiveRestore className="h-4 w-4" />
                      ) : (
                        <Archive className="h-4 w-4" />
                      )}
                    </button>
                    {archived ? (
                      <button
                        type="button"
                        onClick={() => setDeleting(item)}
                        className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
                        title="Удалить навсегда"
                        aria-label="Удалить навсегда"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {items.length < total ? (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => void load(page + 1, true)}
                disabled={loading}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Показать ещё
              </button>
            </div>
          ) : null}
        </>
      )}
      {loading && items.length === 0 ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : null}

      {editing ? (
        <EditLibraryItemDialog
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={(next) => {
            replaceItem(next);
            setEditing(null);
          }}
        />
      ) : null}
      <AdminConfirmDialog
        open={deleting !== null}
        title="Удалить макет навсегда?"
        description={
          deleting
            ? `«${deleting.title}» и его файл будут удалены без возможности восстановления. Если файл используется в заказах, удаление не пройдёт — тогда он остаётся в архиве.`
            : ""
        }
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        busy={deleteBusy}
        onConfirm={() => void hardDelete()}
        onClose={() => setDeleting(null)}
      />
    </main>
  );
}
