"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useLanguageStore } from "@/stores/useLanguageStore";
import type { SerializedCompanyProfile } from "@/lib/invoice/companyProfile";
import { formatInvoiceNumber } from "@/lib/invoice/companyProfile";
import { resolveCompanyLogoImgSrc } from "@/lib/companyLogoShared";
import { LOCALES, LOCALE_LABELS } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  ProductionSettingsPanel,
  type ProductionSettingsPanelHandle,
} from "./ProductionSettingsPanel";

type Status = "idle" | "saving" | "saved" | "error";

const SETTINGS_FORM_ID = "admin-settings-form";

export default function SettingsPageClient({
  initialProfile,
}: {
  initialProfile: SerializedCompanyProfile;
}) {
  const { t } = useLanguageStore();
  const [profile, setProfile] = useState<SerializedCompanyProfile>(initialProfile);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [logoUploadBusy, setLogoUploadBusy] = useState(false);
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);
  const [logoLocalPreviewUrl, setLogoLocalPreviewUrl] = useState<string | null>(null);
  const logoFileInputRef = useRef<HTMLInputElement>(null);
  const productionPanelRef = useRef<ProductionSettingsPanelHandle>(null);
  const [productionDataReady, setProductionDataReady] = useState(false);

  useEffect(() => {
    return () => {
      if (logoLocalPreviewUrl) URL.revokeObjectURL(logoLocalPreviewUrl);
    };
  }, [logoLocalPreviewUrl]);

  const logoImgSrc = resolveCompanyLogoImgSrc(profile.logoPath);
  const logoDisplaySrc = logoLocalPreviewUrl ?? logoImgSrc;
  const logoUrlOrPublicPath =
    profile.logoPath?.startsWith("http://") ||
    profile.logoPath?.startsWith("https://") ||
    (profile.logoPath?.startsWith("/") ?? false)
      ? (profile.logoPath ?? "")
      : "";

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

  async function handleLogoFileSelected(file: File) {
    setLogoUploadError(null);
    setLogoUploadBusy(true);
    try {
      const ct = file.type || "application/octet-stream";
      const presign = await fetch("/api/admin/company-logo/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, contentType: ct }),
      });
      if (!presign.ok) {
        const body = (await presign.json().catch(() => ({}))) as { error?: string };
        throw new Error(body?.error ?? "Presign failed");
      }
      const { uploadUrl, fileKey } = (await presign.json()) as {
        uploadUrl: string;
        fileKey: string;
      };
      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": ct },
        body: file,
      });
      if (!put.ok) throw new Error("Upload failed");
      update("logoPath", fileKey);
      setLogoLocalPreviewUrl(URL.createObjectURL(file));
    } catch (err) {
      setLogoUploadError(
        err instanceof Error ? err.message : t.settings.logoUploadFailed,
      );
    } finally {
      setLogoUploadBusy(false);
    }
  }

  async function handleSave() {
    if (!productionDataReady || !productionPanelRef.current) {
      setStatus("error");
      setErrorMessage(t.settings.saveFailed);
      return;
    }
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
          // Always send an explicit boolean so `false` is persisted (JSON omits `undefined`).
          showPublicCabinetLoginCta: profile.showPublicCabinetLoginCta === true,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body?.error ?? "Save failed");
      }
      const data = (await res.json()) as { profile: SerializedCompanyProfile };
      setProfile(data.profile);
      setLogoLocalPreviewUrl(null);

      const prodOk = await productionPanelRef.current.saveProduction();
      if (!prodOk) {
        setStatus("error");
        setErrorMessage(t.settings.saveProductionPartialFailed);
        return;
      }

      setStatus("saved");
      setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 2500);
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <>
      <main className="mx-auto w-full max-w-[1600px] px-4 py-6 pb-24 sm:px-5 sm:py-8 sm:pb-28">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">{t.settings.pageTitle}</h1>
          <p className="mt-1 text-sm text-gray-500">{t.settings.pageSubtitle}</p>
        </header>

        <form
          id={SETTINGS_FORM_ID}
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
          className="space-y-8"
        >
          <Section title={t.settings.sectionPublicSite} columns={1}>
            <div className="space-y-3">
              <span className="block text-sm font-medium text-gray-900">
                {t.settings.fieldShowCabinetLoginCta}
              </span>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={profile.showPublicCabinetLoginCta}
                  aria-label={t.settings.fieldShowCabinetLoginCta}
                  onClick={() =>
                    update("showPublicCabinetLoginCta", !profile.showPublicCabinetLoginCta)
                  }
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
                    profile.showPublicCabinetLoginCta ? "bg-amber-500" : "bg-gray-300",
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
                      profile.showPublicCabinetLoginCta
                        ? "translate-x-5"
                        : "translate-x-1",
                    )}
                  />
                </button>
                <span
                  className={cn(
                    "text-xs font-medium",
                    profile.showPublicCabinetLoginCta
                      ? "text-amber-800"
                      : "text-gray-500",
                  )}
                >
                  {profile.showPublicCabinetLoginCta
                    ? t.settings.fieldShowCabinetLoginCtaOn
                    : t.settings.fieldShowCabinetLoginCtaOff}
                </span>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                {t.settings.fieldShowCabinetLoginCtaHintTitle}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-gray-600">
                {t.settings.fieldShowCabinetLoginCtaHint}
              </p>
            </div>
          </Section>

          <div
            className="border-t border-gray-200 pt-10"
            role="presentation"
            aria-hidden
          />

          <div className="space-y-8 rounded-2xl border border-gray-200/90 bg-gray-50/70 p-4 sm:p-6">
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
            <div className="sm:col-span-2">
              <Field label={t.settings.fieldLogoPath} hint={t.settings.fieldLogoPathHint}>
                <input
                  ref={logoFileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void handleLogoFileSelected(file);
                  }}
                />
                <div className="flex flex-wrap items-center gap-3">
                  {logoDisplaySrc ? (
                    <img
                      src={logoDisplaySrc}
                      alt=""
                      className="h-16 w-16 shrink-0 rounded-full border border-gray-200 object-cover"
                      width={64}
                      height={64}
                    />
                  ) : (
                    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-dashed border-gray-300 text-xs text-gray-400">
                      —
                    </span>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={logoUploadBusy}
                      onClick={() => logoFileInputRef.current?.click()}
                    >
                      {logoUploadBusy
                        ? t.settings.logoUploading
                        : t.settings.logoUploadButton}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={!profile.logoPath}
                      onClick={() => {
                        setLogoLocalPreviewUrl(null);
                        update("logoPath", null);
                      }}
                    >
                      {t.settings.logoRemoveButton}
                    </Button>
                  </div>
                </div>
                {logoUploadError ? (
                  <p className="mt-2 text-xs text-red-600">{logoUploadError}</p>
                ) : null}
                <p className="mt-3 text-xs font-medium text-gray-600">
                  {t.settings.fieldLogoOptionalUrl}
                </p>
                <Input
                  className="mt-1"
                  value={logoUrlOrPublicPath}
                  onChange={(e) => {
                    setLogoLocalPreviewUrl(null);
                    update("logoPath", e.target.value.trim() || null);
                  }}
                  placeholder="https://…"
                />
              </Field>
            </div>
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
          </div>
        </form>

        <div className="mt-10 border-t border-gray-200 pt-10">
          <ProductionSettingsPanel
            ref={productionPanelRef}
            saveUi="unified"
            onProductionReadyChange={setProductionDataReady}
          />
        </div>
      </main>

      <div
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200/90 bg-white/95 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] backdrop-blur supports-[backdrop-filter]:bg-white/85"
        role="region"
        aria-label={t.settings.saveButton}
      >
        <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-3 px-4 py-3 sm:px-5 sm:py-3.5">
          <Button
            type="submit"
            form={SETTINGS_FORM_ID}
            disabled={
              status === "saving" ||
              !productionDataReady ||
              logoUploadBusy
            }
          >
            {status === "saving" ? t.settings.saving : t.settings.saveButton}
          </Button>
          {status === "saved" && (
            <span className="text-sm text-emerald-600">{t.settings.saved}</span>
          )}
          {status === "error" && (
            <span className="min-w-0 flex-1 text-sm text-red-600">
              {t.settings.saveFailed}
              {errorMessage ? `: ${errorMessage}` : ""}
            </span>
          )}
        </div>
      </div>
    </>
  );
}

function Section({
  title,
  children,
  columns = 2,
}: {
  title: string;
  children: React.ReactNode;
  /** `1` = full-width single column (e.g. public site toggles). */
  columns?: 1 | 2;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
        {title}
      </h2>
      <div
        className={cn(
          "grid gap-6",
          columns === 2 && "sm:grid-cols-2 sm:gap-4",
          columns === 1 && "grid-cols-1",
        )}
      >
        {children}
      </div>
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
