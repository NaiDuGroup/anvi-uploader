"use client";

import { useState } from "react";
import { useOrdersStore } from "@/stores/useOrdersStore";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, FileText } from "lucide-react";

export default function EditOrderModal({
  order,
  t,
  onClose,
  onSaved,
}: {
  order: { id: string; phone: string; clientName: string | null; notes: string | null };
  t: ReturnType<typeof useLanguageStore.getState>["t"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { updateOrder } = useOrdersStore();
  const [phone, setPhone] = useState(order.phone);
  const [clientName, setClientName] = useState(order.clientName ?? "");
  const [notes, setNotes] = useState(order.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (phone.length < 8) return;
    setSaving(true);
    setError("");
    try {
      await updateOrder(order.id, {
        phone,
        clientName: clientName.trim() || null,
        notes: notes.trim() || null,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-6 text-gray-900">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-6">
          <FileText className="w-5 h-5 text-blue-500" />
          <h2 className="text-lg font-bold">{t.admin.editOrder}</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">{t.common.phone} *</label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              type="tel"
              placeholder={t.admin.clientPhonePlaceholder}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">{t.admin.clientName}</label>
            <Input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder={t.admin.clientNamePlaceholder}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">{t.upload.notesLabel}</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t.upload.notesPlaceholder}
              maxLength={500}
              rows={3}
              className="flex w-full rounded-md border border-gray-200 bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950 resize-none"
            />
          </div>

          {error && <p className="text-sm text-red-500 text-center">{error}</p>}

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
              {t.admin.cancel}
            </Button>
            <Button
              className="flex-1"
              onClick={handleSave}
              disabled={phone.length < 8 || saving}
            >
              {saving ? t.admin.saving : t.admin.save}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
