"use client";

import { useState } from "react";
import { Building2, KeyRound, Lock, Mail, Phone, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguageStore } from "@/stores/useLanguageStore";

type ProfileInitial = {
  kind: string;
  phone: string;
  personName: string | null;
  companyName: string | null;
  companyIdno: string | null;
  email: string | null;
};

export default function ProfileClient({ initial }: { initial: ProfileInitial }) {
  const { t } = useLanguageStore();
  const [personName, setPersonName] = useState(initial.personName ?? "");
  const [companyName, setCompanyName] = useState(initial.companyName ?? "");
  const [companyIdno, setCompanyIdno] = useState(initial.companyIdno ?? "");
  const [email, setEmail] = useState(initial.email ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<
    | { kind: "ok"; text: string }
    | { kind: "error"; text: string }
    | null
  >(null);

  const isLegal = initial.kind === "LEGAL";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/cabinet/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personName,
          ...(isLegal
            ? {
                companyName,
                companyIdno,
              }
            : {}),
          email,
          ...(password ? { password } : {}),
        }),
      });
      if (!res.ok) {
        setFeedback({ kind: "error", text: t.cabinet.profileSaveFailed });
        return;
      }
      setPassword("");
      setFeedback({ kind: "ok", text: t.cabinet.profileSaved });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 sm:space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {t.cabinet.profileTitle}
        </h1>
        <p className="mt-1 text-sm text-gray-500">{t.cabinet.profileSubtitle}</p>
      </header>

      <form
        onSubmit={submit}
        className="space-y-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6"
      >
        <Section
          title={t.cabinet.profilePhone}
          icon={Phone}
          description={t.cabinet.profilePhoneLocked}
        >
          <Input
            value={initial.phone}
            readOnly
            disabled
            className="bg-gray-100 text-gray-700"
          />
        </Section>

        <Section title={t.cabinet.profilePersonName} icon={User}>
          <Input
            value={personName}
            onChange={(e) => setPersonName(e.target.value)}
            autoComplete="name"
          />
        </Section>

        {isLegal ? (
          <Section title={t.cabinet.profileCompanyName} icon={Building2}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t.cabinet.profileCompanyName}>
                <Input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  autoComplete="organization"
                />
              </Field>
              <Field label={t.cabinet.profileCompanyIdno}>
                <Input
                  value={companyIdno}
                  onChange={(e) => setCompanyIdno(e.target.value)}
                />
              </Field>
            </div>
          </Section>
        ) : null}

        <Section title={t.cabinet.profileEmail} icon={Mail}>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            inputMode="email"
          />
        </Section>

        <Section
          title={t.cabinet.profileNewPassword}
          icon={KeyRound}
          description={t.cabinet.profileNewPasswordHint}
        >
          <Input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            placeholder="••••••••"
          />
        </Section>

        {feedback ? (
          <p
            className={
              "rounded-lg px-3 py-2 text-sm " +
              (feedback.kind === "ok"
                ? "bg-emerald-50 text-emerald-800"
                : "bg-red-50 text-red-700")
            }
            role={feedback.kind === "ok" ? "status" : "alert"}
          >
            {feedback.text}
          </p>
        ) : null}

        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={busy}>
            <Lock className="h-4 w-4" />
            {busy ? t.cabinet.profileSaving : t.cabinet.profileSave}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  description,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-800">
        <Icon className="h-4 w-4 text-gray-500" />
        <span>{title}</span>
      </div>
      {children}
      {description ? (
        <p className="text-xs text-gray-500">{description}</p>
      ) : null}
    </div>
  );
}

function Field({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={"flex flex-col gap-1.5 " + (wide ? "sm:col-span-2" : "")}>
      <span className="text-xs font-medium text-gray-600">{label}</span>
      {children}
    </label>
  );
}
