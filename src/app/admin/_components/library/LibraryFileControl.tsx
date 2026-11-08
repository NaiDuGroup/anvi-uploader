"use client";

import { useState } from "react";
import Link from "next/link";
import { BookmarkCheck, BookmarkPlus } from "lucide-react";
import { isLibraryKey } from "@/lib/library/libraryKeys";
import { useInLibrary } from "./useLibraryStatus";
import { SaveToLibraryDialog } from "./SaveToLibraryDialog";
import type { LibraryOwner } from "./LibraryOwnerField";

/** «В библиотеке» badge for an order file (saved from it, or reused from the library). */
export function InLibraryBadge({ fileId, fileUrl }: { fileId: string; fileUrl: string }) {
  const libId = useInLibrary(fileId);
  if (!libId && !isLibraryKey(fileUrl)) return null;
  return (
    <Link
      href={libId ? `/admin/library?item=${libId}` : "/admin/library"}
      className="inline-flex items-center gap-0.5 rounded bg-emerald-50 px-1.5 py-px text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
      title="Макет хранится в библиотеке и не удалится через 7 дней"
      data-testid="in-library-badge"
    >
      <BookmarkCheck className="h-3 w-3" aria-hidden />В библиотеке
    </Link>
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
  const libId = useInLibrary(fileId);
  const [open, setOpen] = useState(false);
  if (libId || libId === undefined || isLibraryKey(fileUrl)) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-amber-50 hover:text-amber-700"
        title="В библиотеку — сохранить макет навсегда"
        aria-label="В библиотеку"
        data-testid="save-file-to-library"
      >
        <BookmarkPlus className="h-4 w-4 shrink-0" aria-hidden />
      </button>
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
        Все в библиотеку
      </button>
      {open ? (
        <SaveToLibraryDialog
          target={{ kind: "order", orderId, orderNumber, fileCount, orderClient }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
