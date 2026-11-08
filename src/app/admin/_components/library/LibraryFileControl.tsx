"use client";

import { useState } from "react";
import Link from "next/link";
import { ArchiveRestore, BookmarkCheck, BookmarkPlus, Loader2 } from "lucide-react";
import { isLibraryKey } from "@/lib/library/libraryKeys";
import { markInLibrary, useArchivedInLibrary, useCanManageLibrary, useInLibrary } from "./useLibraryStatus";
import { libraryFetch, type LibraryItem } from "./libraryClient";
import { SaveToLibraryDialog } from "./SaveToLibraryDialog";
import type { LibraryOwner } from "./LibraryOwnerField";
import { useLanguageStore } from "@/stores/useLanguageStore";

/** «В библиотеке» badge for an order file (saved from it, or reused from the library). */
export function InLibraryBadge({
  fileId,
  fileUrl,
}: {
  fileId: string;
  fileUrl: string;
}) {
  const d = useLanguageStore((s) => s.t.library);
  const libId = useInLibrary(fileId);
  const archivedId = useArchivedInLibrary(fileId);
  if (!libId && archivedId) return <ArchivedInLibraryBadge fileId={fileId} libraryId={archivedId} />;
  if (!libId && !isLibraryKey(fileUrl)) return null;
  return (
    <Link
      href={libId ? `/admin/library?item=${libId}` : "/admin/library"}
      className="inline-flex items-center gap-0.5 rounded bg-emerald-50 px-1.5 py-px text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
      title={d.inLibraryTitle}
      data-testid="in-library-badge"
    >
      <BookmarkCheck className="h-3 w-3" aria-hidden />
      {d.inLibraryBadge}
    </Link>
  );
}

/**
 * The file's library copy is archived: say so (instead of offering a second
 * copy) and let admins «Восстановить» it in place.
 */
function ArchivedInLibraryBadge({ fileId, libraryId }: { fileId: string; libraryId: string }) {
  const d = useLanguageStore((s) => s.t.library);
  const canManage = useCanManageLibrary();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const restore = async () => {
    setBusy(true);
    setError(null);
    const res = await libraryFetch<{ item: LibraryItem }>(`/api/admin/library/${libraryId}`, {
      method: "PATCH",
      body: JSON.stringify({ archived: false }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error || d.restoreFailed);
      return;
    }
    markInLibrary([{ fileId, libraryId }]);
  };
  return (
    <span className="inline-flex items-center gap-1" data-testid="archived-in-library">
      <span
        className="inline-flex items-center gap-0.5 rounded bg-gray-100 px-1.5 py-px text-[10px] font-semibold text-gray-600 ring-1 ring-gray-200"
        title={d.archivedTitle}
      >
        <BookmarkCheck className="h-3 w-3" aria-hidden />
        {d.archivedBadge}
      </span>
      {canManage ? (
        <button
          type="button"
          onClick={() => void restore()}
          disabled={busy}
          className="inline-flex items-center gap-0.5 rounded px-1 py-px text-[10px] font-semibold text-amber-700 hover:bg-amber-50 hover:text-amber-900 disabled:opacity-50"
          data-testid="restore-from-library-archive"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <ArchiveRestore className="h-3 w-3" aria-hidden />}
          {d.restore}
        </button>
      ) : null}
      {error ? <span className="text-[10px] font-medium text-red-600">{error}</span> : null}
    </span>
  );
}

/** Per-file «В библиотеку» icon button (hidden once the file is in the library). */
export function SaveFileToLibraryButton({
  fileId,
  fileUrl,
  fileName,
  orderNumber,
  orderClient,
}: {
  fileId: string;
  fileUrl: string;
  fileName: string;
  orderNumber: number;
  orderClient: LibraryOwner | null;
}) {
  const d = useLanguageStore((s) => s.t.library);
  const libId = useInLibrary(fileId);
  const archivedId = useArchivedInLibrary(fileId);
  const [open, setOpen] = useState(false);
  // The dialog stays mounted after a save (its «done» screen) although the button hides.
  const showButton = !libId && libId !== undefined && !archivedId && !isLibraryKey(fileUrl);
  if (!showButton && !open) return null;
  return (
    <>
      {showButton ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-amber-50 hover:text-amber-700"
          title={d.saveToLibraryTitle}
          aria-label={d.saveToLibrary}
          data-testid="save-file-to-library"
        >
          <BookmarkPlus className="h-4 w-4 shrink-0" aria-hidden />
        </button>
      ) : null}
      {open ? (
        <SaveToLibraryDialog
          target={{ kind: "file", fileId, fileName, orderNumber, orderClient }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

/** «В библиотеку все» link next to «Скачать все». */
export function SaveOrderToLibraryLink({
  orderId,
  orderNumber,
  fileCount,
  orderClient,
}: {
  orderId: string;
  orderNumber: number;
  fileCount: number;
  orderClient: LibraryOwner | null;
}) {
  const d = useLanguageStore((s) => s.t.library);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-800 hover:underline"
        data-testid="save-order-to-library"
      >
        <BookmarkPlus className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {d.saveAllLink}
      </button>
      {open ? (
        <SaveToLibraryDialog
          target={{
            kind: "order",
            orderId,
            orderNumber,
            fileCount,
            orderClient,
          }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
