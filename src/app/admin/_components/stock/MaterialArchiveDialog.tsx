"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { AdminConfirmDialog } from "@/app/admin/_components/AdminConfirmDialog";
import { Button } from "@/components/ui/button";
import { friendlyErrorText } from "@/lib/http/apiErrorMessage";
import { MATERIAL_HAS_HISTORY_ERROR } from "@/lib/stock/materialArchive";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { adminTableOutlineIconButtonClass } from "@/app/admin/_components/AdminTableIconActions";
import { cn } from "@/lib/utils";

/** Archive / hard delete asked for one roll or paper (`apiBase` = `/api/admin/large-format-materials` …). */
export type MaterialArchiveAction = { kind: "archive" | "delete"; id: string; name: string };

/** Error text of a failed archive request; a refused hard delete gets the «оставьте в архиве» advice. */
async function archiveErrorText(res: Response, locale: Parameters<typeof friendlyErrorText>[1], historyText: string): Promise<string> {
  if (res.status === 409) {
    try {
      const body = (await res.clone().json()) as { error?: unknown };
      if (body.error === MATERIAL_HAS_HISTORY_ERROR) return historyText;
    } catch {
      // fall through to the generic text
    }
  }
  return friendlyErrorText(res, locale);
}

/** Sets `isActive` (false = archived). Returns an error text, or null on success. */
export async function setMaterialArchived(
  apiBase: string,
  id: string,
  archived: boolean,
  locale: Parameters<typeof friendlyErrorText>[1],
): Promise<string | null> {
  try {
    const res = await fetch(`${apiBase}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !archived }),
    });
    return res.ok ? null : await friendlyErrorText(res, locale);
  } catch {
    return friendlyErrorText(null, locale);
  }
}

export function MaterialArchiveDialog({
  apiBase,
  action,
  onClose,
  onDone,
}: {
  apiBase: string;
  action: MaterialArchiveAction | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useLanguageStore();
  const locale = useLanguageStore((s) => s.locale);
  const a = t.admin.materialArchive;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isDelete: boolean = action?.kind === "delete";

  return (
    <AdminConfirmDialog
      open={action != null}
      title={isDelete ? a.deleteForeverConfirmTitle : a.archiveConfirmTitle}
      description={
        action == null
          ? ""
          : isDelete
            ? a.deleteForeverConfirmDescription(action.name)
            : a.archiveConfirmDescription(action.name)
      }
      confirmLabel={isDelete ? a.deleteForever : a.archive}
      confirmVariant={isDelete ? "destructive" : "default"}
      cancelLabel={t.admin.lfMaterialCatalogCancel}
      busy={busy}
      error={error}
      onClose={() => {
        if (busy) return;
        setError(null);
        onClose();
      }}
      onConfirm={() => {
        void (async () => {
          if (!action) return;
          setBusy(true);
          setError(null);
          try {
            if (action.kind === "archive") {
              const err: string | null = await setMaterialArchived(apiBase, action.id, true, locale);
              if (err) {
                setError(err);
                return;
              }
            } else {
              const res = await fetch(`${apiBase}/${action.id}`, { method: "DELETE" });
              if (!res.ok) {
                setError(await archiveErrorText(res, locale, a.hasHistoryError));
                return;
              }
            }
            onDone();
          } catch {
            setError(await friendlyErrorText(null, locale));
          } finally {
            setBusy(false);
          }
        })();
      }}
    />
  );
}

/** «Архив» badge of an archived row. */
export function MaterialArchivedBadge() {
  const { t } = useLanguageStore();
  return (
    <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600 ring-1 ring-gray-200">
      {t.admin.materialArchive.badge}
    </span>
  );
}

/** Row actions: «В архив» on an active row; «Вернуть из архива» + «Удалить навсегда» on an archived one. */
export function MaterialArchiveRowActions({
  archived,
  onArchive,
  onUnarchive,
  onDeleteForever,
  unarchiveBusy,
}: {
  archived: boolean;
  onArchive: () => void;
  onUnarchive: () => void;
  onDeleteForever: () => void;
  unarchiveBusy?: boolean;
}) {
  const { t } = useLanguageStore();
  const a = t.admin.materialArchive;
  if (!archived) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={adminTableOutlineIconButtonClass}
        title={a.archive}
        aria-label={a.archive}
        onClick={onArchive}
      >
        <Archive className="h-3.5 w-3.5 shrink-0" aria-hidden />
      </Button>
    );
  }
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={adminTableOutlineIconButtonClass}
        title={a.unarchive}
        aria-label={a.unarchive}
        disabled={unarchiveBusy}
        onClick={onUnarchive}
      >
        <ArchiveRestore className="h-3.5 w-3.5 shrink-0" aria-hidden />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(
          adminTableOutlineIconButtonClass,
          "border-red-100 text-red-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700",
        )}
        title={a.deleteForever}
        aria-label={a.deleteForever}
        onClick={onDeleteForever}
      >
        <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
      </Button>
    </>
  );
}
