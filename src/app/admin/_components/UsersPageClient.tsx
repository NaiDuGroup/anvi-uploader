"use client";

import { useState, useEffect, useCallback } from "react";
import { useLanguageStore } from "@/stores/useLanguageStore";
import type { TranslationDictionary } from "@/lib/i18n/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2, X, Shield, ShieldCheck, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type UserRow = {
  id: string;
  name: string;
  displayName: string | null;
  role: string;
};

const ROLE_OPTIONS = ["admin", "workshop", "superadmin"] as const;

function RoleBadge({ role, t }: { role: string; t: TranslationDictionary }) {
  const label =
    role === "superadmin"
      ? t.admin.roleSuperAdmin
      : role === "workshop"
        ? t.admin.roleWorkshop
        : t.admin.roleAdmin;
  const Icon = role === "superadmin" ? ShieldCheck : role === "workshop" ? Wrench : Shield;
  const variant = role === "superadmin" ? "default" : role === "workshop" ? "warning" : "secondary";
  return (
    <Badge variant={variant as "default" | "secondary" | "warning"} className="gap-1 text-[11px]">
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}

export default function UsersPageClient({ currentUserId }: { currentUserId: string }) {
  const { t } = useLanguageStore();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [fName, setFName] = useState("");
  const [fDisplayName, setFDisplayName] = useState("");
  const [fRole, setFRole] = useState<string>("admin");
  const [fPassword, setFPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      if (!res.ok) {
        setError("Failed to load users");
        setRows([]);
        return;
      }
      const data = (await res.json()) as UserRow[];
      setError(null);
      setRows(data);
    } catch {
      setError("Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setFName("");
    setFDisplayName("");
    setFRole("admin");
    setFPassword("");
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (u: UserRow) => {
    setEditing(u);
    setFName(u.name);
    setFDisplayName(u.displayName ?? "");
    setFRole(u.role);
    setFPassword("");
    setFormError(null);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);

    try {
      if (editing) {
        const body: Record<string, string> = {};
        if (fDisplayName.trim()) body.displayName = fDisplayName.trim();
        if (fRole !== editing.role) body.role = fRole;
        if (fPassword) body.password = fPassword;
        const res = await fetch(`/api/admin/users/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setFormError((err as { error?: string }).error ?? "Failed to update user");
          return;
        }
      } else {
        const res = await fetch("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: fName.trim(),
            displayName: fDisplayName.trim() || undefined,
            role: fRole,
            password: fPassword,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setFormError((err as { error?: string }).error ?? "Failed to create user");
          return;
        }
      }
      closeForm();
      load();
    } catch {
      setFormError("Network error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/admin/users/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert((err as { error?: string }).error ?? "Failed to delete user");
        return;
      }
      setDeleteTarget(null);
      load();
    } catch {
      alert("Network error");
    }
  };

  const roleLabel = (role: string) =>
    role === "superadmin"
      ? t.admin.roleSuperAdmin
      : role === "workshop"
        ? t.admin.roleWorkshop
        : t.admin.roleAdmin;

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-5 sm:py-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">
            {t.admin.usersTitle}
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">{t.admin.usersSubtitle}</p>
        </div>
        <Button size="sm" onClick={openCreate} className="gap-1.5 self-start sm:self-auto">
          <Plus className="h-4 w-4" />
          {t.admin.usersAdd}
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200/80 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="px-4 py-3 text-left font-medium text-gray-600">{t.admin.usersDisplayName}</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">{t.admin.usersLogin}</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">{t.admin.usersRole}</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">{t.common.actions}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-gray-400">
                    {t.common.loading}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-gray-400">
                    {t.admin.usersNoRows}
                  </td>
                </tr>
              ) : (
                rows.map((u) => (
                  <tr
                    key={u.id}
                    className={cn(
                      "border-b border-gray-50 transition-colors hover:bg-gray-50/50",
                      u.id === currentUserId && "bg-amber-50/30",
                    )}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {u.displayName ?? <span className="text-gray-400 italic">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{u.name}</td>
                    <td className="px-4 py-3">
                      <RoleBadge role={u.role} t={t} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1 text-gray-500 hover:text-gray-700"
                          onClick={() => openEdit(u)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">{t.admin.usersEdit}</span>
                        </Button>
                        {u.id !== currentUserId && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 text-red-500 hover:bg-red-50 hover:text-red-700"
                            onClick={() => setDeleteTarget(u)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">{t.admin.usersDelete}</span>
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Form (slide-over panel) */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-end">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={closeForm} />
          <div className="relative z-10 h-full w-full max-w-md overflow-y-auto border-l border-gray-200 bg-white shadow-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-5 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                {editing ? t.admin.usersEdit : t.admin.usersAdd}
              </h2>
              <button
                onClick={closeForm}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5 px-5 py-6">
              {/* Login (name) — only for create */}
              {!editing && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    {t.admin.usersLogin}
                  </label>
                  <Input
                    value={fName}
                    onChange={(e) => setFName(e.target.value)}
                    required
                    autoFocus
                    placeholder="user@example.com"
                  />
                </div>
              )}

              {/* Display Name */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  {t.admin.usersDisplayName}
                </label>
                <Input
                  value={fDisplayName}
                  onChange={(e) => setFDisplayName(e.target.value)}
                  placeholder="John Doe"
                  autoFocus={!!editing}
                />
              </div>

              {/* Role */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  {t.admin.usersRole}
                </label>
                <select
                  value={fRole}
                  onChange={(e) => setFRole(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/20"
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {roleLabel(r)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Password */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  {editing ? t.admin.usersNewPassword : t.admin.usersPassword}
                </label>
                <Input
                  type="password"
                  value={fPassword}
                  onChange={(e) => setFPassword(e.target.value)}
                  required={!editing}
                  minLength={6}
                  placeholder={editing ? "" : "min 6 characters"}
                />
                {editing && (
                  <p className="mt-1 text-xs text-gray-400">{t.admin.usersNewPasswordHint}</p>
                )}
              </div>

              {formError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                  {formError}
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <Button type="submit" disabled={saving} className="flex-1">
                  {saving
                    ? editing
                      ? t.admin.usersUpdating
                      : t.admin.usersCreating
                    : t.admin.usersSave}
                </Button>
                <Button type="button" variant="outline" onClick={closeForm} className="flex-1">
                  {t.admin.cancel}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">{t.admin.usersDeleteConfirm}</h3>
            <p className="mt-2 text-sm text-gray-500">
              {deleteTarget.displayName ?? deleteTarget.name} ({deleteTarget.name})
            </p>
            {deleteTarget.id === currentUserId && (
              <p className="mt-2 text-sm font-medium text-red-600">{t.admin.usersCannotDeleteSelf}</p>
            )}
            <div className="mt-5 flex items-center gap-3">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={deleteTarget.id === currentUserId}
                className="flex-1"
              >
                {t.admin.usersDelete}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteTarget(null)}
                className="flex-1"
              >
                {t.admin.cancel}
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
