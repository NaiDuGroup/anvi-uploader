"use client";

import { useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import { LibrarySheet, sheetCancelClass, sheetInputClass, sheetPrimaryClass } from "./LibrarySheet";
import { LibraryOwnerField, libraryOwnerIncomplete, type LibraryOwner } from "./LibraryOwnerField";
import { libraryFetch, libraryMetaText, type LibraryItem } from "./libraryClient";
import { LibraryThumb } from "./LibraryThumb";

/** «Изменить»: title, tags and owner of a library item. */
export function EditLibraryItemDialog({
  item,
  onClose,
  onSaved,
}: {
  item: LibraryItem;
  onClose: () => void;
  onSaved: (item: LibraryItem) => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [tags, setTags] = useState(item.tags.join(", "));
  const [owner, setOwner] = useState<LibraryOwner>({ clientId: item.clientId, clientName: item.clientName });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (libraryOwnerIncomplete(owner)) {
      setError("Выберите клиента");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await libraryFetch<{ item: LibraryItem }>(`/api/admin/library/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: title.trim(), tags, clientId: owner.clientId }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onSaved(res.data.item);
  };

  return (
    <LibrarySheet
      title="Изменить макет"
      icon={<Pencil className="h-5 w-5 shrink-0 text-amber-600" aria-hidden />}
      onClose={onClose}
      busy={busy}
      testId="edit-library-item-dialog"
      footer={
        <>
          <button type="button" className={sheetCancelClass} onClick={onClose} disabled={busy}>
            Отмена
          </button>
          <button type="button" className={sheetPrimaryClass} onClick={() => void save()} disabled={busy || !title.trim()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Сохранить
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <LibraryThumb item={item} className="h-16 w-16 shrink-0 rounded-lg border border-gray-200" />
          <div className="min-w-0 text-xs text-gray-500">
            <p className="truncate font-medium text-gray-800" title={item.fileName}>
              {item.fileName}
            </p>
            <p>{libraryMetaText(item)}</p>
          </div>
        </div>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Название</span>
          <input className={sheetInputClass} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} disabled={busy} />
        </label>
        <LibraryOwnerField
          value={owner}
          onChange={(next) => {
            setOwner(next);
            setError(null);
          }}
          orderClient={item.clientId ? { clientId: item.clientId, clientName: item.clientName } : null}
          orderClientLabel="Текущий клиент"
          disabled={busy}
        />
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Теги</span>
          <input className={sheetInputClass} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="визитки, логотип" disabled={busy} />
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
