"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useLanguageStore } from "@/stores/useLanguageStore";
import type { SerializedCompanyProfile } from "@/lib/invoice/companyProfile";
import { formatInvoiceNumber } from "@/lib/invoice/companyProfile";
import { LOCALES, LOCALE_LABELS } from "@/lib/i18n";

type Status = "idle" | "saving" | "saved" | "error";

export default function SettingsPageClient({
  initialProfile,
}: {
  initialProfile: SerializedCompanyProfile;
}) {
  const { t } = useLanguageStore();
  const [profile, setProfile] = useState<SerializedCompanyProfile>(initialProfile);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const nextInvoiceNumber = useMemo(
    () =>
      formatInvoiceNumber(
        Math.max(profile.invoiceCounter, 0) + 1,
        Math.max(profile.invoiceNumberPadding, 1),
      ),
    [profile.invoiceCounter, profile.invoiceNumberPadding],
  );

  function update<K extends keyof SerializedCompanyProfile>(
    key: K,
    value: SerializedCompanyProfile[K],
  ) {
    setProfile((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setStatus("saving");
    setErrorMessage(null);
    try {
      const res = await fetch("/api/admin/company-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profile.name,
          fiscalCode: profile.fiscalCode,
          address: profile.address,
          iban: profile.iban,
          bankName: profile.bankName,
          bic: profile.bic,
          directorName: profile.directorName,
          accountantName: profile.accountantName,
          vatRate: Number(profile.vatRate) || 0,
          invoiceNumberPadding: profile.invoiceNumberPadding,
          invoiceValidityDays: profile.invoiceValidityDays,
          defaultLocale: profile.defaultLocale,
          currency: profile.currency,
          logoPath: profile.logoPath,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body?.error ?? "Save failed");
      }
      const data = (await res.json()) as { profile: SerializedCompanyProfile };
      setProfile(data.profile);
      setStatus("saved");
      setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 2500);
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t.settings.pageTitle}</h1>
        <p className="mt-1 text-sm text-gray-500">{t.settings.pageSubtitle}</p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSave();
        }}
        className="space-y-8"
      >
        <Section title={t.settings.sectionCompany}>
          <Field label={t.settings.fieldName}>
            <Input
              value={profile.name}
              onChange={(e) => update("name", e.target.value)}
              required
            />
          </Field>
          <Field label={t.settings.fieldFiscalCode}>
            <Input
              value={profile.fiscalCode}
              onChange={(e) => update("fiscalCode", e.target.value)}
              required
            />
          </Field>
          <Field label={t.settings.fieldAddress}>
            <Input
              value={profile.address}
              onChange={(e) => update("address", e.target.value)}
              required
            />
          </Field>
          <Field label={t.settings.fieldLogoPath} hint={t.settings.fieldLogoPathHint}>
            <Input
              value={profile.logoPath ?? ""}
              onChange={(e) => update("logoPath", e.target.value || null)}
              placeholder="/logo.png"
            />
          </Field>
        </Section>

        <Section title={t.settings.sectionBank}>
          <Field label={t.settings.fieldIban}>
            <Input
              value={profile.iban}
              onChange={(e) => update("iban", e.target.value)}
              required
            />
          </Field>
          <Field label={t.settings.fieldBankName}>
            <Input
              value={profile.bankName}
              onChange={(e) => update("bankName", e.target.value)}
              required
            />
          </Field>
          <Field label={t.settings.fieldBic}>
            <Input
              value={profile.bic}
              onChange={(e) => update("bic", e.target.value)}
              required
            />
          </Field>
        </Section>

        <Section title={t.settings.sectionInvoice}>
          <Field
            label={t.settings.fieldVatRate}
            hint={t.settings.fieldVatRateHint}
          >
            <Input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={profile.vatRate}
              onChange={(e) => update("vatRate", e.target.value)}
            />
          </Field>
          <Field label={t.settings.fieldInvoiceValidityDays}>
            <Input
              type="number"
              min={1}
              max={365}
              value={profile.invoiceValidityDays}
              onChange={(e) =>
                update("invoiceValidityDays", Number(e.target.value) || 1)
              }
            />
          </Field>
          <Field label={t.settings.fieldInvoiceNumberPadding}>
            <Input
              type="number"
              min={1}
              max={10}
              value={profile.invoiceNumberPadding}
              onChange={(e) =>
                update("invoiceNumberPadding", Number(e.target.value) || 1)
              }
            />
          </Field>
          <Field label={t.settings.fieldDefaultLocale}>
            <select
              className="flex h-9 w-full rounded-md border border-gray-200 bg-white px-3 py-1 text-base text-gray-900 shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950"
              value={profile.defaultLocale}
              onChange={(e) => update("defaultLocale", e.target.value)}
            >
              {LOCALES.map((loc) => (
                <option key={loc} value={loc}>
                  {LOCALE_LABELS[loc]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t.settings.fieldCurrency}>
            <Input
              value={profile.currency}
              onChange={(e) => update("currency", e.target.value)}
            />
          </Field>
          <p className="text-xs text-gray-500">
            {t.settings.nextInvoiceNumber(nextInvoiceNumber)}
          </p>
        </Section>

        <Section title={t.settings.sectionSignatures}>
          <Field label={t.settings.fieldDirectorName}>
            <Input
              value={profile.directorName ?? ""}
              onChange={(e) => update("directorName", e.target.value || null)}
            />
          </Field>
          <Field label={t.settings.fieldAccountantName}>
            <Input
              value={profile.accountantName ?? ""}
              onChange={(e) => update("accountantName", e.target.value || null)}
            />
          </Field>
        </Section>

        <div className="flex items-center gap-3 border-t border-gray-100 pt-4">
          <Button type="submit" disabled={status === "saving"}>
            {status === "saving" ? t.settings.saving : t.settings.saveButton}
          </Button>
          {status === "saved" && (
            <span className="text-sm text-emerald-600">{t.settings.saved}</span>
          )}
          {status === "error" && (
            <span className="text-sm text-red-600">
              {t.settings.saveFailed}
              {errorMessage ? `: ${errorMessage}` : ""}
            </span>
          )}
        </div>
      </form>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
        {title}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-gray-700">{label}</span>
      {children}
      {hint ? <span className="text-xs text-gray-400">{hint}</span> : null}
    </label>
  );
}
