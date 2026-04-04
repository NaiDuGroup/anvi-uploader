"use client";

import { useState, useEffect, useCallback } from "react";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clientPickerLabel } from "@/lib/studioClient";
import type { ClientKind } from "@/lib/validations";
import { Plus, Pencil, Trash2, X, Search } from "lucide-react";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  kind: string;
  phone: string | null;
  personName: string | null;
  companyName: string | null;
  companyIdno: string | null;
};

export default function ClientsPageClient() {
  const { t } = useLanguageStore();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    const tmr = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(tmr);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "200");
      if (debounced) params.set("search", debounced);
      const res = await fetch(`/api/admin/clients?${params}`);
      if (!res.ok) {
        setRows([]);
        let detail = "";
        try {
          const errBody = (await res.json()) as { error?: string; code?: string };
          if (errBody.error) detail = errBody.error;
          if (errBody.code) detail = detail ? `${detail} (${errBody.code})` : String(errBody.code);
        } catch {
          /* ignore */
        }
        setListError(detail || null);
        return;
      }
      const data = (await res.json()) as { clients: Row[] };
      setListError(null);
      setRows(data.clients ?? []);
    } finally {
      setLoading(false);
    }
  }, [debounced]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-gray-900">{t.admin.clientsTitle}</h1>
          <p className="mt-1 text-sm text-gray-500">{t.admin.clientsSubtitle}</p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          {t.admin.clientsAdd}
        </Button>
      </div>

      {listError ? (
        <div
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          <p className="font-medium">{t.admin.clientsLoadFailed}</p>
          <p className="mt-1 font-mono text-xs break-words text-red-900/90">{listError}</p>
        </div>
      ) : null}

      <div className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t.admin.clientsSearchPlaceholder}
          className="pl-10"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">{t.admin.clientsTitle}</th>
              <th className="px-4 py-3">{t.admin.clientsPhone}</th>
              <th className="px-4 py-3">{t.admin.clientsCompanyIdno}</th>
              <th className="px-4 py-3 w-32" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                  {t.admin.loadingOrders}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                  {listError ? "\u00a0" : t.admin.clientsNoRows}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50/80">
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "mr-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
                        r.kind === "LEGAL"
                          ? "bg-violet-100 text-violet-800"
                          : "bg-amber-100 text-amber-900",
                      )}
                    >
                      {r.kind === "LEGAL"
                        ? t.admin.clientsKindLegal
                        : t.admin.clientsKindIndividual}
                    </span>
                    <span className="text-gray-900">{clientPickerLabel(r)}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{r.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{r.companyIdno ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-2"
                        onClick={() => {
                          setEditing(r);
                          setFormOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 border-red-200 px-2 text-red-600 hover:bg-red-50"
                        onClick={() => setDeleteTarget(r)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {formOpen && (
        <ClientFormModal
          t={t}
          initial={editing}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSaved={() => {
            setFormOpen(false);
            setEditing(null);
            load();
          }}
        />
      )}

      {deleteTarget && (
        <DeleteClientModal
          t={t}
          row={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            setDeleteTarget(null);
            load();
          }}
        />
      )}
    </main>
  );
}

function ClientFormModal({
  t,
  initial,
  onClose,
  onSaved,
}: {
  t: ReturnType<typeof useLanguageStore.getState>["t"];
  initial: Row | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<ClientKind>(
    (initial?.kind as ClientKind) ?? "INDIVIDUAL",
  );
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [personName, setPersonName] = useState(initial?.personName ?? "");
  const [companyName, setCompanyName] = useState(initial?.companyName ?? "");
  const [companyIdno, setCompanyIdno] = useState(initial?.companyIdno ?? "");
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
      const errBody = (await res.json().catch(() => ({}))) as { error?: string };
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
      onSaved();
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
                <label className="mb-1.5 block text-sm font-medium">{t.admin.clientsPhone} *</label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  type="tel"
                  autoComplete="tel"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">{t.admin.clientsPersonName} *</label>
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
                <label className="mb-1.5 block text-sm font-medium">{t.admin.clientsPhone}</label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  type="tel"
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

function DeleteClientModal({
  t,
  row,
  onClose,
  onDeleted,
}: {
  t: ReturnType<typeof useLanguageStore.getState>["t"];
  row: Row;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold">{t.admin.clientsConfirmDeleteTitle}</h2>
        <p className="mt-2 text-sm text-gray-600">{t.admin.clientsConfirmDeleteBody}</p>
        <p className="mt-2 text-sm font-medium text-gray-900">{clientPickerLabel(row)}</p>
        <div className="mt-6 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            {t.admin.cancel}
          </Button>
          <Button
            className="flex-1 bg-red-600 hover:bg-red-700"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const res = await fetch(`/api/admin/clients/${row.id}`, { method: "DELETE" });
                if (res.ok) onDeleted();
              } finally {
                setBusy(false);
              }
            }}
          >
            {t.admin.clientsDelete}
          </Button>
        </div>
      </div>
    </div>
  );
}
