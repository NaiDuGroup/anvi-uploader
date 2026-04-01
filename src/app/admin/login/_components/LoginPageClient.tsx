"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLanguageStore } from "@/stores/useLanguageStore";

export default function LoginPageClient() {
  const { t } = useLanguageStore();
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(false);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, password }),
      });

      if (!res.ok) {
        setError(true);
        return;
      }

      router.push("/admin");
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-start sm:items-center justify-center pt-4 px-4 pb-4 sm:p-4">
      <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8 max-w-sm w-full text-gray-900">
        <div className="flex justify-end mb-4">
          <LanguageSwitcher />
        </div>

        <div className="text-center mb-8">
          <img src="/logo.png" alt="ANVI" className="w-20 h-20 rounded-full mx-auto mb-3" />
          <h1 className="text-2xl font-bold text-gray-900">{t.login.title}</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">
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
            <label className="block text-sm font-medium mb-1.5">
              {t.login.passwordLabel}
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t.login.passwordPlaceholder}
              required
              data-testid="admin-login-password"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500 text-center">{t.login.error}</p>
          )}

          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={loading}
            data-testid="admin-login-submit"
          >
            {loading ? t.login.loggingIn : t.login.submitButton}
          </Button>
        </form>
      </div>
    </div>
  );
}
