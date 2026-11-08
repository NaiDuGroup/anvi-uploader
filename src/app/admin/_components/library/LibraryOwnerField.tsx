"use client";

import { useState } from "react";
import ClientPicker, { type ClientPickerValue } from "@/app/admin/_components/ClientPicker";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { cn } from "@/lib/utils";

export type LibraryOwner = { clientId: string | null; clientName: string | null };

/**
 * Owner of a library item: the order's client (preselected), «Общий», or —
 * when there is no order client / when editing — any client from the picker.
 */
export function LibraryOwnerField({
  value,
  onChange,
  orderClient,
  orderClientLabel,
  disabled,
}: {
  value: LibraryOwner;
  onChange: (next: LibraryOwner) => void;
  /** The order's client, offered as the first choice. */
  orderClient?: LibraryOwner | null;
  orderClientLabel?: string;
  disabled?: boolean;
}) {
  const { t } = useLanguageStore();
  const d = t.library;
  const [picked, setPicked] = useState<ClientPickerValue | null>(null);
  const isCommon = value.clientId === null;
  const isOrderClient = Boolean(orderClient?.clientId) && value.clientId === orderClient?.clientId;
  const isOther = !isCommon && !isOrderClient;

  const radio = (checked: boolean, label: string, onSelect: () => void, hint?: string | null) => (
    <label
      className={cn(
        "flex min-h-10 cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm",
        checked ? "border-amber-400 bg-amber-50" : "border-gray-200 hover:bg-gray-50",
        disabled && "pointer-events-none opacity-60",
      )}
    >
      <input type="radio" className="mt-0.5 accent-amber-600" checked={checked} onChange={onSelect} disabled={disabled} />
      <span className="min-w-0">
        <span className="block font-medium text-gray-900">{label}</span>
        {hint ? <span className="block truncate text-xs text-gray-500">{hint}</span> : null}
      </span>
    </label>
  );

  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1 text-sm font-medium text-gray-700">{d.ownerLegend}</legend>
      {orderClient?.clientId
        ? radio(isOrderClient, orderClientLabel ?? d.orderClient, () => onChange(orderClient), orderClient.clientName)
        : null}
      {radio(isCommon, d.common, () => onChange({ clientId: null, clientName: null }), d.commonHint)}
      {radio(
        isOther,
        orderClient?.clientId ? d.otherClient : d.clientLabel,
        () => {
          if (picked) onChange({ clientId: picked.id, clientName: picked.personName || picked.companyName || picked.phone });
          else if (!isOther) onChange({ clientId: "", clientName: null });
        },
        isOther && value.clientId ? value.clientName : null,
      )}
      {isOther ? (
        <div className="pl-1 pt-1">
          <ClientPicker
            value={picked}
            t={t.admin}
            disabled={disabled}
            inlineDropdown
            onChange={(c) => {
              setPicked(c);
              onChange(c ? { clientId: c.id, clientName: c.personName || c.companyName || c.phone } : { clientId: "", clientName: null });
            }}
          />
        </div>
      ) : null}
    </fieldset>
  );
}

/** «Другой клиент» chosen but no client picked yet. */
export function libraryOwnerIncomplete(o: LibraryOwner): boolean {
  return o.clientId === "";
}
