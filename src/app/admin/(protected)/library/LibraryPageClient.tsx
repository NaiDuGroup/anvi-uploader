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
  libraryOrderNumber,
  type LibraryItem,
} from "@/app/admin/_components/library/libraryClient";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { cn } from "@/lib/utils";

type OwnerFilter = "all" | "common" | "client";

const PAGE_SIZE = 48;
/** How long «Отменить» stays after archive / restore. */
const UNDO_MS = 6000;

type Notice = { text: string; tone: "info" | "error"; undo?: () => Promise<void> };

/**
 * «Библиотека макетов»: artwork staff saved on purpose from orders. Copies
 * live under `library/` (not deleted after 7 days like `uploads/`) and new
 * orders reuse them from the wizard («Из библиотеки»).
 */
export default function LibraryPageClient({
  focusItemId,
  canManage,
}: {
  focusItemId: string | null;
  /** Admin / superadmin: edit, archive, restore, delete. The workshop only views and downloads. */
  canManage: boolean;
}) {
  const { t } = useLanguageStore();
  const d = t.library;
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
  const [archiving, setArchiving] = useState<LibraryItem | null>(null);
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
      if (!append) setPage(0);
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
      if (!res.ok) return;
      // The workshop cannot edit: find the item in the list instead.
      if (canManage) setEditing(res.data.item);
      else setQuery(res.data.item.title);
    });
  }, [focusItemId, canManage]);

  const replaceItem = (next: LibraryItem) =>
    setItems((prev) => prev.map((i) => (i.id === next.id ? next : i)));

  // Notice under the filters; «Отменить» for a few seconds after archive / restore.
  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showNotice = useCallback((next: Notice | null) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = null;
    setNotice(next);
    if (next?.undo) noticeTimer.current = setTimeout(() => setNotice(null), UNDO_MS);
  }, []);
  useEffect(() => () => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
  }, []);

  const patchArchived = (item: LibraryItem, value: boolean) =>
    libraryFetch<{ item: LibraryItem }>(`/api/admin/library/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ archived: value }),
    });

  /** Archive (after the confirm) or restore; the item leaves the current view and «Отменить» brings it back. */
  const setArchivedFlag = async (item: LibraryItem, value: boolean) => {
    setRowBusy(item.id);
    const res = await patchArchived(item, value);
    setRowBusy(null);
    if (!res.ok) {
      showNotice({ text: res.error, tone: "error" });
      return;
    }
    const index = items.findIndex((i) => i.id === item.id);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    setTotal((n) => Math.max(0, n - 1));
    showNotice({
      text: value ? d.archivedNotice(item.title) : d.restoredNotice(item.title),
      tone: "info",
      undo: async () => {
        showNotice(null);
        const back = await patchArchived(item, !value);
        if (!back.ok) {
          showNotice({ text: back.error, tone: "error" });
          return;
        }
        setItems((prev) => {
          if (prev.some((i) => i.id === item.id)) return prev;
          const next = [...prev];
          next.splice(index < 0 ? 0 : Math.min(index, next.length), 0, back.data.item);
          return next;
        });
        setTotal((n) => n + 1);
      },
    });
  };

  const confirmArchive = async () => {
    if (!archiving) return;
    const item = archiving;
    setArchiving(null);
    await setArchivedFlag(item, true);
  };

  const hardDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    const res = await libraryFetch<{ ok: true }>(`/api/admin/library/${deleting.id}`, { method: "DELETE" });
    setDeleteBusy(false);
    if (!res.ok) {
      showNotice({ text: res.error, tone: "error" });
      setDeleting(null);
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== deleting.id));
    setTotal((n) => Math.max(0, n - 1));
    showNotice({ text: d.deletedNotice(deleting.title), tone: "info" });
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

  const iconBtn = "inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100";
  /** First load or a filter change: skeleton instead of «Найдено: 0» / stale results. */
  const showSkeleton = loading && (items.length === 0 || page === 0);

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900 sm:text-2xl">
            <BookMarked className="h-6 w-6 text-amber-600" aria-hidden />
            {d.pageTitle}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">{d.pageIntro}</p>
        </div>
        {canManage ? (
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" className="size-4 accent-amber-600" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
            {d.archiveToggle}
          </label>
        ) : (
          <p className="max-w-sm text-xs text-gray-500" data-testid="library-read-only">
            {d.readOnlyHint}
          </p>
        )}
      </div>

      <div className="mb-4 space-y-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={d.searchPlaceholder}
            className="h-10 w-full rounded-lg border border-gray-300 pl-9 pr-9 text-sm text-gray-900 placeholder:text-gray-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200"
            aria-label={d.searchAria}
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-gray-400 hover:bg-gray-100"
              aria-label={d.clearSearch}
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {filterBtn("all", d.filterAll)}
          {filterBtn("common", d.filterCommon)}
          {filterBtn("client", d.filterClient)}
          {owner === "client" ? (
            <div className="w-full sm:w-80">
              <ClientPicker value={client} onChange={setClient} t={t.admin} />
            </div>
          ) : null}
        </div>
      </div>

      {notice ? (
        <div
          role="status"
          className={cn(
            "mb-3 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm",
            notice.tone === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900",
          )}
          data-testid="library-notice"
        >
          <span className="min-w-0">{notice.text}</span>
          <span className="flex shrink-0 items-center gap-1">
            {notice.undo ? (
              <button
                type="button"
                onClick={() => void notice.undo?.()}
                className="h-8 rounded-md px-2.5 text-sm font-semibold text-amber-800 ring-1 ring-amber-300 hover:bg-amber-100"
                data-testid="library-undo"
              >
                {d.undo}
              </button>
            ) : null}
            <button type="button" onClick={() => showNotice(null)} className="inline-flex h-8 w-8 items-center justify-center rounded-md" aria-label={d.close}>
              <X className="h-4 w-4" />
            </button>
          </span>
        </div>
      ) : null}
      {error ? <p className="mb-3 text-sm text-red-700">{error}</p> : null}

      {owner === "client" && !client ? (
        <p className="py-10 text-center text-sm text-gray-500">{d.pickClientFirst}</p>
      ) : showSkeleton ? (
        <LibrarySkeleton />
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white py-12 text-center text-sm text-gray-500">
          {archived
            ? d.emptyArchive
            : debounced
              ? d.emptySearch
              : owner === "common"
                ? d.emptyCommon
                : owner === "client"
                  ? d.emptyClient
                  : d.emptyAll}
        </div>
      ) : (
        <>
          <p className="mb-2 text-xs text-gray-500">{d.found(total)}</p>
          <ul className={GRID_CLASS} data-testid="library-grid">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex flex-row gap-3 overflow-hidden rounded-xl border border-gray-200 bg-white p-2 shadow-sm sm:flex-col sm:gap-0 sm:p-0"
                data-testid="library-item"
              >
                <a
                  href={libraryFileUrl(item.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block shrink-0"
                  title={d.openFile}
                >
                  <LibraryThumb
                    item={item}
                    className="h-20 w-20 rounded-lg border border-gray-100 sm:aspect-[4/3] sm:h-auto sm:w-full sm:rounded-none sm:border-0 sm:border-b"
                  />
                </a>
                <div className="flex min-w-0 flex-1 flex-col gap-1 sm:gap-1.5 sm:p-3">
                  <p className="line-clamp-2 text-sm font-semibold leading-snug text-gray-900" title={item.title}>
                    {item.title}
                  </p>
                  <p className="hidden truncate text-xs text-gray-500 sm:block" title={item.fileName}>
                    {item.fileName}
                  </p>
                  <div className="flex min-w-0 flex-wrap items-center gap-1">
                    <span
                      className={cn(
                        "max-w-full truncate rounded px-1.5 py-0.5 text-[11px] font-medium",
                        item.clientId ? "bg-blue-50 text-blue-800" : "bg-gray-100 text-gray-700",
                      )}
                      title={item.clientId ? `${item.clientName ?? d.clientFallback} ${item.clientPhone ?? ""}` : d.common}
                    >
                      {item.clientId ? (item.clientName ?? item.clientPhone ?? d.clientFallback) : d.common}
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
                  <p className="truncate text-[11px] text-gray-500 sm:whitespace-normal">{libraryMetaText(item, d.meta) || "—"}</p>
                  <p className="truncate text-[11px] text-gray-500 sm:whitespace-normal">
                    {d.uses(item.useCount)}
                    {item.sourceOrderNumber ? ` · ${d.fromOrder(libraryOrderNumber(item.sourceOrderNumber))}` : null}
                  </p>
                  <div className="-ml-2 mt-auto flex flex-wrap items-center gap-0.5 sm:ml-0 sm:gap-1 sm:pt-1">
                    <a
                      href={libraryFileUrl(item.id, true)}
                      className={cn(iconBtn, "hover:text-blue-600")}
                      title={d.download}
                      aria-label={d.download}
                    >
                      <Download className="h-4 w-4" />
                    </a>
                    {canManage ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setEditing(item)}
                          className={cn(iconBtn, "hover:text-amber-700")}
                          title={d.edit}
                          aria-label={d.edit}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => (archived ? void setArchivedFlag(item, false) : setArchiving(item))}
                          disabled={rowBusy === item.id}
                          className={cn(iconBtn, "hover:text-gray-800 disabled:opacity-50")}
                          title={archived ? d.restore : d.archive}
                          aria-label={archived ? d.restore : d.archive}
                          data-testid={archived ? "library-restore" : "library-archive"}
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
                            title={d.deleteForever}
                            aria-label={d.deleteForever}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        ) : null}
                      </>
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
                {d.showMore}
              </button>
            </div>
          ) : null}
        </>
      )}

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
        open={archiving !== null}
        title={d.archiveConfirmTitle}
        description={archiving ? d.archiveConfirmText(archiving.title) : ""}
        confirmLabel={d.archiveConfirm}
        cancelLabel={d.cancel}
        onConfirm={() => void confirmArchive()}
        onClose={() => setArchiving(null)}
      />
      <AdminConfirmDialog
        open={deleting !== null}
        title={d.deleteConfirmTitle}
        description={deleting ? d.deleteConfirmText(deleting.title) : ""}
        confirmLabel={d.deleteConfirm}
        cancelLabel={d.cancel}
        confirmVariant="destructive"
        busy={deleteBusy}
        onConfirm={() => void hardDelete()}
        onClose={() => setDeleting(null)}
      />
    </main>
  );
}

/** Phones: compact rows (thumb left); from `sm`: cards. */
const GRID_CLASS =
  "grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";

function LibrarySkeleton() {
  return (
    <div aria-busy="true" data-testid="library-skeleton">
      <div className="mb-2 h-3 w-24 animate-pulse rounded bg-gray-200" />
      <ul className={GRID_CLASS}>
        {Array.from({ length: 10 }, (_, i) => (
          <li
            key={i}
            className="flex animate-pulse flex-row gap-3 overflow-hidden rounded-xl border border-gray-200 bg-white p-2 sm:flex-col sm:gap-0 sm:p-0"
          >
            <div className="h-20 w-20 shrink-0 rounded-lg bg-gray-100 sm:aspect-[4/3] sm:h-auto sm:w-full sm:rounded-none" />
            <div className="flex flex-1 flex-col gap-2 py-1 sm:p-3">
              <div className="h-3.5 w-3/4 rounded bg-gray-200" />
              <div className="h-3 w-1/2 rounded bg-gray-100" />
              <div className="h-3 w-2/3 rounded bg-gray-100" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
