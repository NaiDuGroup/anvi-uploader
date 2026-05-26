"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NavLinkButton } from "@/components/ui/NavLinkButton";
import { clientPickerLabel } from "@/lib/studioClient";
import { Plus, Pencil, Trash2, X, Search, KeyRound, BadgeCheck, Copy, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { ClientFormModal } from "./ClientFormModal";
import { isSuperAdmin } from "@/lib/roles";
import { useClients, type ClientRow } from "@/lib/swr";
import { useDebounce } from "@/hooks/useDebounce";

type Row = ClientRow;

export default function ClientsPageClient({
  currentUserRole,
}: {
  currentUserRole: string;
}) {
  const { t } = useLanguageStore();
  const canMutate = isSuperAdmin(currentUserRole);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const [inviteTarget, setInviteTarget] = useState<Row | null>(null);
  const [pendingDealerToggle, setPendingDealerToggle] = useState<string | null>(null);

  const debouncedSearch = useDebounce(search.trim(), 300);
  const { clients: rows, error: listErrorObj, isLoading: loading, mutate } = useClients(debouncedSearch);
  const listError = listErrorObj ? (listErrorObj instanceof Error ? listErrorObj.message : "Failed to load") : null;

  const load = useCallback(() => { mutate(); }, [mutate]);

  const toggleDealer = useCallback(
    async (row: Row, next: boolean) => {
      if (!canMutate) return;
      setPendingDealerToggle(row.id);
      try {
        const res = await fetch(`/api/admin/clients/${row.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ isDealer: next }),
        });
        if (res.ok) {
          mutate();
        }
      } finally {
        setPendingDealerToggle(null);
      }
    },
    [canMutate, mutate],
  );

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
              <th className="px-4 py-3">{t.admin.clientsDealerColumn}</th>
              <th className="px-4 py-3">{t.admin.clientsPortalColumn}</th>
              <th className="px-4 py-3 w-44" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  {t.admin.clientsLoading}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
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
                    {r.companyIdno ? (
                      <span className="ml-2 text-xs text-gray-500">IDNO {r.companyIdno}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{r.phone ?? "—"}</td>
                  <td className="px-4 py-3">
                    {canMutate ? (
                      <>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={r.isDealer}
                          disabled={pendingDealerToggle === r.id}
                          onClick={() => toggleDealer(r, !r.isDealer)}
                          className={cn(
                            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                            r.isDealer ? "bg-emerald-500" : "bg-gray-300",
                            pendingDealerToggle === r.id && "opacity-50",
                          )}
                        >
                          <span
                            className={cn(
                              "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
                              r.isDealer ? "translate-x-5" : "translate-x-1",
                            )}
                          />
                        </button>
                        <span
                          className={cn(
                            "ml-2 text-xs font-medium",
                            r.isDealer ? "text-emerald-700" : "text-gray-500",
                          )}
                        >
                          {r.isDealer
                            ? t.admin.clientsDealerYes
                            : t.admin.clientsDealerNo}
                        </span>
                      </>
                    ) : (
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1",
                          r.isDealer
                            ? "bg-emerald-50 text-emerald-800 ring-emerald-200/80"
                            : "bg-gray-100 text-gray-600 ring-gray-200/80",
                        )}
                        aria-label={
                          r.isDealer
                            ? t.admin.clientsDealerYes
                            : t.admin.clientsDealerNo
                        }
                      >
                        {r.isDealer
                          ? t.admin.clientsDealerYes
                          : t.admin.clientsDealerNo}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.userAccount ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        <BadgeCheck className="h-3.5 w-3.5" />
                        {t.admin.clientsPortalCreated}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">{t.admin.clientsPortalNone}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {!r.userAccount && canMutate ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1 px-2 text-xs"
                          onClick={() => setInviteTarget(r)}
                          title={t.admin.clientsCreatePortalAccount}
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          {t.admin.clientsCreatePortalAccount}
                        </Button>
                      ) : null}
                      <NavLinkButton
                        href={`/admin/invoices/new?clientId=${r.id}`}
                        prefetch={false}
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 px-2 text-xs"
                        title={t.invoices.clientHistoryNew}
                        leadingIcon={<FileText className="h-3.5 w-3.5" />}
                      >
                        {t.invoices.clientHistoryNew}
                      </NavLinkButton>
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
          renderHeaderExtras={(client) => (
            <ClientInvoicesSection clientId={client.id} t={t} />
          )}
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

      {inviteTarget && (
        <InvitePortalModal
          t={t}
          row={inviteTarget}
          onClose={() => setInviteTarget(null)}
          onCreated={() => {
            setInviteTarget(null);
            load();
          }}
        />
      )}
    </main>
  );
}

function generatePortalPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

function InvitePortalModal({
  t,
  row,
  onClose,
  onCreated,
}: {
  t: ReturnType<typeof useLanguageStore.getState>["t"];
  row: Row;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [password, setPassword] = useState(() => generatePortalPassword());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/clients/${row.id}/portal-account`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ password }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        password?: string;
      };
      if (!res.ok) {
        setError(body.error || t.admin.clientsPortalCreateFailed);
        return;
      }
      setCreatedPassword(body.password ?? password);
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!createdPassword) return;
    try {
      await navigator.clipboard.writeText(createdPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
        >
          <X className="h-5 w-5" />
        </button>
        <h2 className="mb-1 text-lg font-bold">{t.admin.clientsPortalModalTitle}</h2>
        <p className="mb-4 text-sm text-gray-600">{clientPickerLabel(row)}</p>

        {createdPassword ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              {t.admin.clientsPortalCreatedSuccess}
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                {t.admin.clientsPortalPasswordLabel}
              </label>
              <div className="flex gap-2">
                <Input
                  value={createdPassword}
                  readOnly
                  className="font-mono text-sm"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button variant="outline" onClick={handleCopy} className="gap-1">
                  <Copy className="h-3.5 w-3.5" />
                  {copied ? t.admin.clientsPortalCopied : t.admin.clientsPortalCopy}
                </Button>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                {t.admin.clientsPortalHandoverHint}
              </p>
            </div>
            <Button className="w-full" onClick={onCreated}>
              {t.admin.clientsPortalDone}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">{t.admin.clientsPortalIntro}</p>
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                {t.admin.clientsPortalPasswordLabel}
              </label>
              <div className="flex gap-2">
                <Input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="font-mono text-sm"
                />
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setPassword(generatePortalPassword())}
                >
                  {t.admin.clientsPortalRegenerate}
                </Button>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {t.admin.clientsPortalPasswordHint}
              </p>
            </div>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={onClose}>
                {t.admin.cancel}
              </Button>
              <Button className="flex-1" disabled={busy || password.length < 8} onClick={submit}>
                {busy ? t.admin.clientsPortalCreating : t.admin.clientsPortalCreate}
              </Button>
            </div>
          </div>
        )}
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

interface ClientInvoiceRow {
  id: string;
  number: string | null;
  status: string;
  totalAmount: string;
  currency: string;
  issueDate: string;
  validUntil: string;
  isExpired: boolean;
}

function ClientInvoicesSection({
  clientId,
  t,
}: {
  clientId: string;
  t: ReturnType<typeof useLanguageStore.getState>["t"];
}) {
  const [rows, setRows] = useState<ClientInvoiceRow[] | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/admin/invoices?clientId=${encodeURIComponent(clientId)}&limit=10`, {
      signal: ctrl.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { invoices: ClientInvoiceRow[] };
        setRows(data.invoices);
      })
      .catch(() => setRows([]));
    return () => ctrl.abort();
  }, [clientId]);

  return (
    <section className="mb-5 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <header className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">
          {t.invoices.clientHistoryTitle}
        </h3>
        <Link
          href={`/admin/invoices/new?clientId=${clientId}`}
          prefetch={false}
          className="text-xs font-medium text-amber-700 hover:underline"
        >
          {t.invoices.clientHistoryNew}
        </Link>
      </header>
      {rows === null ? (
        <p className="text-xs text-gray-500">{t.invoices.listLoading}</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-gray-500">{t.invoices.clientHistoryEmpty}</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => {
            const status =
              r.status === "ISSUED" && r.isExpired ? "EXPIRED" : r.status;
            return (
              <li key={r.id} className="flex items-center justify-between text-xs">
                <Link
                  href={`/admin/invoices/${r.id}`}
                  prefetch={false}
                  className="flex min-w-0 flex-1 items-center gap-2 text-gray-700 hover:text-gray-900"
                >
                  <span className="font-medium text-gray-900">
                    {r.number ?? "—"}
                  </span>
                  <span className="text-gray-500">
                    {new Date(r.issueDate).toLocaleDateString()}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                      status === "DRAFT" && "bg-gray-100 text-gray-700",
                      status === "ISSUED" && "bg-amber-50 text-amber-800",
                      status === "PAID" && "bg-emerald-50 text-emerald-800",
                      status === "CANCELLED" && "bg-red-50 text-red-700",
                      status === "EXPIRED" && "bg-orange-50 text-orange-800",
                    )}
                  >
                    {status === "DRAFT"
                      ? t.invoices.statusDraft
                      : status === "ISSUED"
                        ? t.invoices.statusIssued
                        : status === "PAID"
                          ? t.invoices.statusPaid
                          : status === "CANCELLED"
                            ? t.invoices.statusCancelled
                            : t.invoices.statusExpired}
                  </span>
                </Link>
                <span className="font-semibold text-gray-900">
                  {r.totalAmount} {r.currency}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
