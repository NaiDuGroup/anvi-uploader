"use client";

import { useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useLanguageStore } from "@/stores/useLanguageStore";
import type { ClientKind } from "@/lib/validations";
import { cn } from "@/lib/utils";
import {
  duplicateClientLabel,
  type DuplicateClientField,
  type DuplicateClientInfo,
} from "@/lib/clientDuplicates";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";

/** Minimal record returned by `POST /api/admin/clients` and `PATCH /api/admin/clients/[id]`. */
export interface ClientFormSavedClient {
  id: string;
  kind: string;
  phone: string | null;
  personName: string | null;
  companyName: string | null;
  companyIdno: string | null;
  email?: string | null;
  isDealer?: boolean;
  userAccount?: { id: string; name: string } | null;
}

/** Initial values when editing; `null` (or omitted) creates a new client. */
export type ClientFormInitial = ClientFormSavedClient | null;

type T = ReturnType<typeof useLanguageStore.getState>["t"];

export function ClientFormModal({
  t,
  initial,
  onClose,
  onSaved,
  /**
   * Optional slot rendered between the title and the form (e.g. invoice history when editing).
   * Kept as a render prop to keep the modal feature-agnostic.
   */
  renderHeaderExtras,
  /**
   * When set, a duplicate (409) offers «Выбрать этого клиента» — e.g. the invoice
   * form picks the existing record instead of creating a second one.
   */
  onUseExisting,
}: {
  t: T;
  initial: ClientFormInitial;
  onClose: () => void;
  onSaved: (saved: ClientFormSavedClient) => void;
  renderHeaderExtras?: (initial: ClientFormSavedClient) => React.ReactNode;
  onUseExisting?: (existing: DuplicateClientInfo) => void;
}) {
  useBodyScrollLock();
  const [kind, setKind] = useState<ClientKind>(
    (initial?.kind as ClientKind) ?? "INDIVIDUAL",
  );
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [personName, setPersonName] = useState(initial?.personName ?? "");
  const [companyName, setCompanyName] = useState(initial?.companyName ?? "");
  const [companyIdno, setCompanyIdno] = useState(initial?.companyIdno ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [duplicate, setDuplicate] = useState<{
    field: DuplicateClientField;
    existing: DuplicateClientInfo;
  } | null>(null);

  const submit = async () => {
    setSaving(true);
    setError("");
    setDuplicate(null);
    const body = {
      kind,
      phone: phone.trim() || undefined,
      personName: personName.trim() || undefined,
      companyName: companyName.trim() || undefined,
      companyIdno: companyIdno.trim() || undefined,
    };
    try {
      const url = initial
        ? `/api/admin/clients/${initial.id}`
        : "/api/admin/clients";
      const res = await fetch(url, {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      const errBody = (await res.json().catch(() => ({}))) as {
        error?: string;
        id?: string;
        field?: DuplicateClientField;
        existing?: DuplicateClientInfo;
      };
      if (res.status === 409) {
        if (errBody.error === "duplicate_client" && errBody.existing && errBody.field) {
          setDuplicate({ field: errBody.field, existing: errBody.existing });
        } else {
          setError(t.admin.clientsDuplicatePhone);
        }
        return;
      }
      if (!res.ok) {
        if (res.status === 401) {
          setError(t.admin.clientsUnauthorized);
        } else if (res.status === 400) {
          setError(
            errBody.error === "Validation failed"
              ? t.admin.clientsValidationFailed
              : typeof errBody.error === "string" && errBody.error.length > 0
                ? errBody.error
                : t.admin.clientsValidationFailed,
          );
        } else if (typeof errBody.error === "string" && errBody.error.length > 0) {
          setError(errBody.error);
        } else {
          setError(t.admin.clientsSaveFailed);
        }
        return;
      }
      // Both POST and PATCH return the full StudioCustomer record at the top level.
      const saved = errBody as unknown as ClientFormSavedClient;
      onSaved(saved);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 touch-none bg-black/50" onClick={onClose} />
      <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto overscroll-contain rounded-2xl bg-white p-6 text-gray-900 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
        >
          <X className="h-5 w-5" />
        </button>
        <h2 className="mb-4 text-lg font-bold">
          {initial ? t.admin.clientsEdit : t.admin.clientsAdd}
        </h2>

        {initial && renderHeaderExtras ? renderHeaderExtras(initial) : null}

        <div className="mb-4 flex gap-2">
          {(["INDIVIDUAL", "LEGAL"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn(
                "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                kind === k
                  ? "border-amber-400 bg-amber-50 text-amber-950"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50",
              )}
            >
              {k === "INDIVIDUAL"
                ? t.admin.clientsKindIndividual
                : t.admin.clientsKindLegal}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {kind === "INDIVIDUAL" ? (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  {t.admin.clientsPhone} *
                </label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  type="tel"
                  autoComplete="tel"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  {t.admin.clientsPersonName} *
                </label>
                <Input
                  value={personName}
                  onChange={(e) => setPersonName(e.target.value)}
                  autoComplete="name"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  {t.admin.clientsCompanyName} *
                </label>
                <Input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  {t.admin.clientsCompanyIdno} *
                </label>
                <Input
                  value={companyIdno}
                  onChange={(e) => setCompanyIdno(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  {t.admin.clientsPersonName} *
                </label>
                <Input
                  value={personName}
                  onChange={(e) => setPersonName(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  {t.admin.clientsPhone} *
                </label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  type="tel"
                  autoComplete="tel"
                />
              </div>
            </>
          )}

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          {duplicate ? (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            >
              <p>
                {duplicate.field === "idno"
                  ? t.admin.clientsDuplicateIdnoOf
                  : t.admin.clientsDuplicatePhoneOf}{" "}
                <span className="font-semibold">{duplicateClientLabel(duplicate.existing)}</span>
              </p>
              <p className="mt-0.5 text-xs text-red-700">
                {[duplicate.existing.companyIdno ? `IDNO ${duplicate.existing.companyIdno}` : null, duplicate.existing.phone]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Link
                  href={`/admin/clients/${duplicate.existing.id}`}
                  prefetch={false}
                  className="inline-flex h-8 items-center rounded-md border border-red-300 bg-white px-3 text-xs font-medium text-red-800 hover:bg-red-100"
                >
                  {t.admin.clientsDuplicateOpen}
                </Link>
                {onUseExisting ? (
                  <button
                    type="button"
                    onClick={() => onUseExisting(duplicate.existing)}
                    className="inline-flex h-8 items-center rounded-md bg-red-600 px-3 text-xs font-medium text-white hover:bg-red-700"
                  >
                    {t.admin.clientsDuplicateUse}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              {t.admin.cancel}
            </Button>
            <Button className="flex-1" disabled={saving} onClick={submit}>
              {saving
                ? initial
                  ? t.admin.clientsUpdating
                  : t.admin.clientsCreating
                : t.admin.clientsSave}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
