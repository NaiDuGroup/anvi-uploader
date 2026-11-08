"use client";

import { useState } from "react";
import Link from "next/link";
import { BookmarkPlus, Loader2 } from "lucide-react";
import { defaultLibraryTitle } from "@/lib/library/libraryKeys";
import { LibrarySheet, sheetCancelClass, sheetInputClass, sheetPrimaryClass } from "./LibrarySheet";
import { LibraryOwnerField, libraryOwnerIncomplete, type LibraryOwner } from "./LibraryOwnerField";
import { libraryFetch, type LibraryItem } from "./libraryClient";
import { markInLibrary } from "./useLibraryStatus";

export type SaveToLibraryTarget =
  | { kind: "file"; fileId: string; fileName: string; orderNumber: number; orderClient: LibraryOwner | null }
  | { kind: "order"; orderId: string; orderNumber: number; fileCount: number; orderClient: LibraryOwner | null };

type Skipped = { fileId: string; fileName: string; reason: string };

/**
 * «В библиотеку» (one file) / «Сохранить все файлы заказа»: title (one file
 * only), owner (the order's client preselected, or «Общий»), tags. The server
 * copies the file out of the 7-day `uploads/` area into `library/`.
 */
export function SaveToLibraryDialog({ target, onClose }: { target: SaveToLibraryTarget; onClose: () => void }) {
  const [title, setTitle] = useState(target.kind === "file" ? defaultLibraryTitle(target.fileName) : "");
  const [owner, setOwner] = useState<LibraryOwner>(target.orderClient?.clientId ? target.orderClient : { clientId: null, clientName: null });
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ saved: LibraryItem[]; skipped: Skipped[] } | null>(null);

  const submit = async () => {
    if (libraryOwnerIncomplete(owner)) {
      setError("Выберите клиента");
      return;
    }
    setBusy(true);
    setError(null);
    if (target.kind === "file") {
      const res = await libraryFetch<{ item: LibraryItem }>("/api/admin/library", {
        method: "POST",
        body: JSON.stringify({ fileId: target.fileId, title, tags, clientId: owner.clientId }),
      });
      setBusy(false);
      if (!res.ok) {
        const item = (res.body as { item?: LibraryItem } | undefined)?.item;
        if (item) markInLibrary([{ fileId: target.fileId, libraryId: item.id }]);
        setError(res.error);
        return;
      }
      markInLibrary([{ fileId: target.fileId, libraryId: res.data.item.id }]);
      setDone({ saved: [res.data.item], skipped: [] });
      return;
    }
    const res = await libraryFetch<{ saved: LibraryItem[]; skipped: Skipped[] }>("/api/admin/library/from-order", {
      method: "POST",
      body: JSON.stringify({ orderId: target.orderId, tags, clientId: owner.clientId }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    markInLibrary(
      res.data.saved.flatMap((s) => (s.sourceFileId ? [{ fileId: s.sourceFileId, libraryId: s.id }] : [])),
    );
    setDone(res.data);
  };

  const heading = target.kind === "file" ? "Сохранить в библиотеку" : `Все файлы заказа #${String(target.orderNumber).padStart(4, "0")} в библиотеку`;

  if (done) {
    return (
      <LibrarySheet
        title={heading}
        icon={<BookmarkPlus className="h-5 w-5 shrink-0 text-amber-600" aria-hidden />}
        onClose={onClose}
        footer={
          <>
            <Link href="/admin/library" className={sheetCancelClass + " inline-flex items-center justify-center"}>
              Открыть библиотеку
            </Link>
            <button type="button" className={sheetPrimaryClass} onClick={onClose}>
              Готово
            </button>
          </>
        }
      >
        <p className="text-sm text-emerald-700">
          {done.saved.length === 1 && target.kind === "file"
            ? "Макет сохранён в библиотеку. Он не удалится через 7 дней."
            : `Сохранено в библиотеку: ${done.saved.length}. Эти файлы не удалятся через 7 дней.`}
        </p>
        {done.skipped.length > 0 ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
            <p className="mb-1 font-semibold">Пропущено: {done.skipped.length}</p>
            <ul className="space-y-0.5">
              {done.skipped.map((s) => (
                <li key={s.fileId} className="truncate" title={s.fileName}>
                  {s.fileName} — {s.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </LibrarySheet>
    );
  }

  return (
    <LibrarySheet
      title={heading}
      icon={<BookmarkPlus className="h-5 w-5 shrink-0 text-amber-600" aria-hidden />}
      onClose={onClose}
      busy={busy}
      testId="save-to-library-dialog"
      footer={
        <>
          <button type="button" className={sheetCancelClass} onClick={onClose} disabled={busy}>
            Отмена
          </button>
          <button
            type="button"
            className={sheetPrimaryClass}
            onClick={() => void submit()}
            disabled={busy || (target.kind === "file" && !title.trim())}
            data-testid="save-to-library-submit"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookmarkPlus className="h-4 w-4" />}
            Сохранить
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {target.kind === "file" ? (
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Название</span>
            <input
              className={sheetInputClass}
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
              autoFocus
            />
            <span className="mt-1 block truncate text-xs text-gray-500" title={target.fileName}>
              Файл: {target.fileName}
            </span>
          </label>
        ) : (
          <p className="text-sm text-gray-600">
            Файлов в заказе: {target.fileCount}. Названия — по именам файлов; ссылки и уже удалённые файлы будут пропущены.
          </p>
        )}
        <LibraryOwnerField
          value={owner}
          onChange={(next) => {
            setOwner(next);
            setError(null);
          }}
          orderClient={target.orderClient}
          disabled={busy}
        />
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Теги</span>
          <input
            className={sheetInputClass}
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="визитки, логотип"
            disabled={busy}
          />
          <span className="mt-1 block text-xs text-gray-500">Через запятую — по ним можно искать.</span>
        </label>
        {error ? (
          <p role="alert" className="text-sm font-medium text-red-700">
            {error}
          </p>
        ) : null}
      </div>
    </LibrarySheet>
  );
}
