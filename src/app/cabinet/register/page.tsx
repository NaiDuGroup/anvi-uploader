"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { cn } from "@/lib/utils";

type Kind = "INDIVIDUAL" | "LEGAL";

export default function CabinetRegisterPage() {
  const { t } = useLanguageStore();
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("INDIVIDUAL");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [personName, setPersonName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyIdno, setCompanyIdno] = useState("");
  const [companyIban, setCompanyIban] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cabinet/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          phone,
          password,
          personName: personName || undefined,
          companyName: companyName || undefined,
          companyIdno: companyIdno || undefined,
          companyIban: companyIban || undefined,
          email: email || undefined,
        }),
      });
      if (res.status === 409) {
        setError(t.cabinetAuth.registerDuplicate);
        return;
      }
      if (!res.ok) {
        setError(t.cabinetAuth.registerError);
        return;
      }
      router.push("/cabinet/orders");
      router.refresh();
    } catch {
      setError(t.cabinetAuth.registerError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gray-50 px-4 py-8">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg sm:p-8">
        <div className="mb-4 flex justify-end">
          <LanguageSwitcher />
        </div>
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-gray-900">{t.cabinetAuth.registerTitle}</h1>
          <p className="mt-1 text-sm text-gray-500">{t.cabinetAuth.registerSubtitle}</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="flex gap-2">
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
                  ? t.cabinetAuth.registerKindIndividual
                  : t.cabinetAuth.registerKindLegal}
              </button>
            ))}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">
              {t.cabinetAuth.registerPhoneLabel}
            </label>
            <Input
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">
              {t.cabinetAuth.registerPasswordLabel}
            </label>
            <Input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
            <p className="mt-1 text-xs text-gray-500">{t.cabinetAuth.registerPasswordHint}</p>
          </div>

          {kind === "INDIVIDUAL" ? (
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                {t.cabinetAuth.registerNameLabel}
              </label>
              <Input
                value={personName}
                onChange={(e) => setPersonName(e.target.value)}
                autoComplete="name"
                required
              />
            </div>
          ) : (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  {t.cabinetAuth.registerCompanyLabel}
                </label>
                <Input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  {t.cabinetAuth.registerIdnoLabel}
                </label>
                <Input
                  value={companyIdno}
                  onChange={(e) => setCompanyIdno(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  {t.cabinetAuth.registerIbanLabel}
                </label>
                <Input
                  value={companyIban}
                  onChange={(e) => setCompanyIban(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  {t.cabinetAuth.registerNameLabel}
                </label>
                <Input
                  value={personName}
                  onChange={(e) => setPersonName(e.target.value)}
                  autoComplete="name"
                />
              </div>
            </>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium">
              {t.cabinetAuth.registerEmailLabel}
            </label>
            <Input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {error ? <p className="text-center text-sm text-red-600">{error}</p> : null}

          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? t.cabinetAuth.registerSubmitting : t.cabinetAuth.registerSubmit}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-600">
          {t.cabinetAuth.haveAccount}{" "}
          <Link href="/cabinet/login" className="font-medium text-amber-700 hover:text-amber-900">
            {t.cabinetAuth.goToLogin}
          </Link>
        </p>
      </div>
    </div>
  );
}
