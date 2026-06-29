"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLanguageStore } from "@/stores/useLanguageStore";

type LoginMode = "client" | "staff";

/**
 * Unified, client-first sign-in panel shared by `/cabinet/login` and
 * `/admin/login`. Defaults to the customer (phone) form because customers vastly
 * outnumber staff; a discreet "I'm an administrator" toggle at the bottom swaps
 * to the staff (username) form in place, without navigating away.
 *
 * Both forms keep their original endpoints and the staff form preserves the
 * `admin-login-*` test ids so existing e2e flows keep working.
 */
export default function LoginPanel({
  defaultMode = "client",
  companyLogoSrc,
}: {
  defaultMode?: LoginMode;
  companyLogoSrc: string | null;
}) {
  const { t } = useLanguageStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/cabinet/orders";

  const [mode, setMode] = useState<LoginMode>(defaultMode);

  // Client form state
  const [phone, setPhone] = useState("");
  const [clientPassword, setClientPassword] = useState("");

  // Staff form state
  const [name, setName] = useState("");
  const [staffPassword, setStaffPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const switchMode = (next: LoginMode) => {
    setMode(next);
    setError(null);
  };

  const submitClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cabinet/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, password: clientPassword }),
      });
      if (!res.ok) {
        setError(t.cabinetAuth.loginError);
        setLoading(false);
        return;
      }
      router.push(redirect);
      router.refresh();
    } catch {
      setError(t.cabinetAuth.loginError);
      setLoading(false);
    }
  };

  const submitStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, password: staffPassword }),
      });
      if (!res.ok) {
        let apiError = "";
        try {
          const data = (await res.json()) as { error?: string };
          if (typeof data?.error === "string") apiError = data.error;
        } catch {
          /* ignore */
        }
        if (res.status === 401) {
          setError(t.login.error);
        } else {
          const dev = process.env.NODE_ENV === "development";
          const detail = dev && apiError ? `\n\n${apiError}` : "";
          setError(t.login.errorServer + detail);
        }
        setLoading(false);
        return;
      }
      router.push("/admin/orders");
    } catch {
      setError(t.login.errorServer);
      setLoading(false);
    }
  };

  const title = mode === "client" ? t.cabinetAuth.loginTitle : t.login.title;
  const subtitle = mode === "client" ? t.cabinetAuth.loginSubtitle : null;

  return (
    <div className="flex min-h-dvh items-start justify-center bg-gray-50 px-4 pt-4 pb-4 sm:items-center sm:p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-gray-900 shadow-lg sm:p-8">
        <div className="mb-4 flex justify-end">
          <LanguageSwitcher />
        </div>

        <div className="mb-6 text-center">
          {companyLogoSrc ? (
            <img
              src={companyLogoSrc}
              alt="ANVI"
              className="mx-auto mb-3 h-20 w-20 rounded-full object-cover"
              width={80}
              height={80}
            />
          ) : (
            <span
              className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-amber-100 text-lg font-bold text-amber-900"
              aria-hidden
            >
              A
            </span>
          )}
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          {subtitle ? (
            <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
          ) : null}
        </div>

        {mode === "client" ? (
          <form onSubmit={submitClient} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                {t.cabinetAuth.loginPhoneLabel}
              </label>
              <Input
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                {t.cabinetAuth.loginPasswordLabel}
              </label>
              <Input
                type="password"
                autoComplete="current-password"
                value={clientPassword}
                onChange={(e) => setClientPassword(e.target.value)}
                required
              />
            </div>
            {error ? (
              <p className="text-center text-sm text-red-600">{error}</p>
            ) : null}
            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? t.cabinetAuth.loginSubmitting : t.cabinetAuth.loginSubmit}
            </Button>
          </form>
        ) : (
          <form onSubmit={submitStaff} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                {t.login.nameLabel}
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t.login.namePlaceholder}
                required
                autoFocus
                data-testid="admin-login-name"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                {t.login.passwordLabel}
              </label>
              <Input
                type="password"
                value={staffPassword}
                onChange={(e) => setStaffPassword(e.target.value)}
                placeholder={t.login.passwordPlaceholder}
                required
                data-testid="admin-login-password"
              />
            </div>
            {error ? (
              <p className="whitespace-pre-wrap text-center text-sm text-red-600">
                {error}
              </p>
            ) : null}
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={loading}
              data-testid="admin-login-submit"
            >
              {loading ? t.login.loggingIn : t.login.submitButton}
            </Button>
          </form>
        )}

        {mode === "client" ? (
          <p className="mt-6 text-center text-sm text-gray-600">
            {t.cabinetAuth.noAccount}{" "}
            <Link
              href="/cabinet/register"
              className="font-medium text-amber-700 hover:text-amber-900"
            >
              {t.cabinetAuth.goToRegister}
            </Link>
          </p>
        ) : null}

        <div className="mt-6 border-t border-gray-100 pt-4 text-center">
          {mode === "client" ? (
            <button
              type="button"
              onClick={() => switchMode("staff")}
              className="text-xs font-medium text-gray-400 transition-colors hover:text-gray-600"
              data-testid="login-staff-toggle"
            >
              {t.cabinetAuth.staffToggle}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => switchMode("client")}
              className="text-xs font-medium text-gray-400 transition-colors hover:text-gray-600"
              data-testid="login-client-toggle"
            >
              {t.cabinetAuth.clientToggle}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
