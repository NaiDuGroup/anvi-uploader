"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLanguageStore } from "@/stores/useLanguageStore";

function CabinetLoginInner() {
  const { t } = useLanguageStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/cabinet/orders";

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cabinet/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, password }),
      });
      if (!res.ok) {
        setError(t.cabinetAuth.loginError);
        return;
      }
      router.push(redirect);
      router.refresh();
    } catch {
      setError(t.cabinetAuth.loginError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gray-50 px-4 py-8">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg sm:p-8">
        <div className="mb-4 flex justify-end">
          <LanguageSwitcher />
        </div>
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-gray-900">{t.cabinetAuth.loginTitle}</h1>
          <p className="mt-1 text-sm text-gray-500">{t.cabinetAuth.loginSubtitle}</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
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
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
        <p className="mt-6 text-center text-sm text-gray-600">
          {t.cabinetAuth.noAccount}{" "}
          <Link href="/cabinet/register" className="font-medium text-amber-700 hover:text-amber-900">
            {t.cabinetAuth.goToRegister}
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function CabinetLoginPage() {
  return (
    <Suspense fallback={null}>
      <CabinetLoginInner />
    </Suspense>
  );
}
