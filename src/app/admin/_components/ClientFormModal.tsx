"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useLanguageStore } from "@/stores/useLanguageStore";
import type { ClientKind } from "@/lib/validations";
import { cn } from "@/lib/utils";

/** Minimal record returned by `POST /api/admin/clients` and `PATCH /api/admin/clients/[id]`. */
export interface ClientFormSavedClient {
  id: string;
  kind: string;
  phone: string | null;
  personName: string | null;
  companyName: string | null;
  companyIdno: string | null;
  companyIban: string | null;
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
}: {
  t: T;
  initial: ClientFormInitial;
  onClose: () => void;
  onSaved: (saved: ClientFormSavedClient) => void;
  renderHeaderExtras?: (initial: ClientFormSavedClient) => React.ReactNode;
}) {
  const [kind, setKind] = useState<ClientKind>(
    (initial?.kind as ClientKind) ?? "INDIVIDUAL",
  );
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [personName, setPersonName] = useState(initial?.personName ?? "");
  const [companyName, setCompanyName] = useState(initial?.companyName ?? "");
  const [companyIdno, setCompanyIdno] = useState(initial?.companyIdno ?? "");
  const [companyIban, setCompanyIban] = useState(initial?.companyIban ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setSaving(true);
    setError("");
    const body = {
      kind,
      phone: phone.trim() || undefined,
      personName: personName.trim() || undefined,
      companyName: companyName.trim() || undefined,
      companyIdno: companyIdno.trim() || undefined,
      companyIban: companyIban.trim() || undefined,
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
      };
      if (res.status === 409) {
        setError(t.admin.clientsDuplicatePhone);
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
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 text-gray-900 shadow-xl">
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
                  {t.admin.clientsCompanyIban}
                </label>
                <Input
                  value={companyIban}
                  onChange={(e) => setCompanyIban(e.target.value)}
                  placeholder="MD..."
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
