"use client";

import { useState } from "react";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { Button } from "@/components/ui/button";
import { Trash2, Loader2 } from "lucide-react";

export default function DeleteConfirmModal({
  t,
  onConfirm,
  onClose,
}: {
  t: ReturnType<typeof useLanguageStore.getState>["t"];
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    await onConfirm();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 text-gray-900">
        <div className="flex items-center gap-2 mb-4">
          <Trash2 className="w-5 h-5 text-amber-500" />
          <h2 className="text-lg font-bold">{t.admin.deleteOrder}</h2>
        </div>
        <p className="text-sm text-gray-600 mb-6">{t.admin.deleteConfirmText}</p>
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onClose}
            disabled={deleting}
          >
            {t.admin.cancel}
          </Button>
          <Button
            className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            {t.admin.trashMoveToTrash}
          </Button>
        </div>
      </div>
    </div>
  );
}
