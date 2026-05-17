"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { TranslationDictionary } from "@/lib/i18n/types";
import ClientPicker, { type ClientPickerValue } from "../ClientPicker";

export interface CustomerFormValue {
  phone: string;
  clientName: string;
  notes: string;
  /** Stored as the raw input string. Convert to int at submit time. */
  priceStr: string;
  selectedClient: ClientPickerValue | null;
}

export const EMPTY_CUSTOMER_VALUE: CustomerFormValue = {
  phone: "",
  clientName: "",
  notes: "",
  priceStr: "",
  selectedClient: null,
};

export interface AdminCustomerFormProps {
  value: CustomerFormValue;
  onChange: (next: CustomerFormValue) => void;
  t: TranslationDictionary;
  /** When true, the picker is hidden (e.g. during layout edits). */
  hideClientPicker?: boolean;
}

/**
 * Reusable customer block for the admin order create/edit flows.
 * Owns no state — pure controlled component over `CustomerFormValue`.
 */
export function AdminCustomerForm({
  value,
  onChange,
  t,
  hideClientPicker = false,
}: AdminCustomerFormProps) {
  const registryClientLocked = value.selectedClient != null;

  function patch(patch: Partial<CustomerFormValue>): void {
    onChange({ ...value, ...patch });
  }

  function handlePickClient(c: ClientPickerValue | null): void {
    if (!c) {
      patch({ selectedClient: null });
      return;
    }
    if (c.kind === "INDIVIDUAL") {
      patch({
        selectedClient: c,
        phone: c.phone ?? value.phone,
        clientName: c.personName ?? value.clientName,
      });
      return;
    }
    const nm =
      c.companyName && c.personName
        ? `${c.companyName} — ${c.personName}`
        : c.companyName || c.personName || "";
    patch({
      selectedClient: c,
      phone: c.phone ?? value.phone,
      clientName: nm,
    });
  }

  return (
    <div className="space-y-5">
      {!hideClientPicker && (
        <ClientPicker
          value={value.selectedClient}
          onChange={handlePickClient}
          t={t.admin}
        />
      )}

      {registryClientLocked && (
        <p className="text-xs text-gray-600 leading-snug">
          {t.admin.orderClientFromRegistryLockedHint}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
        <div className="min-w-0">
          <label className="block text-sm font-medium mb-1.5">
            {t.common.phone} *
          </label>
          <Input
            value={value.phone}
            onChange={(e) => patch({ phone: e.target.value })}
            readOnly={registryClientLocked}
            type="tel"
            placeholder={t.admin.clientPhonePlaceholder}
            className={cn(
              registryClientLocked &&
                "cursor-not-allowed bg-gray-50 text-gray-800",
            )}
          />
        </div>

        <div className="min-w-0">
          <label className="block text-sm font-medium mb-1.5">
            {t.admin.clientName}
          </label>
          <Input
            value={value.clientName}
            onChange={(e) => patch({ clientName: e.target.value })}
            readOnly={registryClientLocked}
            placeholder={t.admin.clientNamePlaceholder}
            className={cn(
              registryClientLocked &&
                "cursor-not-allowed bg-gray-50 text-gray-800",
            )}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 items-start sm:grid-cols-12 sm:gap-5">
        <div className="min-w-0 sm:col-span-4 lg:col-span-3">
          <label className="block text-sm font-medium mb-1.5">
            {t.admin.price} ({t.admin.currency})
          </label>
          <Input
            value={value.priceStr}
            onChange={(e) =>
              patch({ priceStr: e.target.value.replace(/\D/g, "").slice(0, 7) })
            }
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder={t.admin.pricePlaceholder}
          />
        </div>

        <div className="min-w-0 sm:col-span-8 lg:col-span-9">
          <label className="block text-sm font-medium mb-1.5">
            {t.upload.notesLabel}
          </label>
          <textarea
            value={value.notes}
            onChange={(e) => patch({ notes: e.target.value })}
            placeholder={t.upload.notesPlaceholder}
            maxLength={500}
            rows={3}
            className="flex w-full rounded-md border border-gray-200 bg-transparent px-3 py-2 text-base sm:text-sm shadow-sm placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950 resize-y min-h-[4.75rem]"
          />
        </div>
      </div>
    </div>
  );
}
