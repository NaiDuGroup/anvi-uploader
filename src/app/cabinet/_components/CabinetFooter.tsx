"use client";

import { useMemo } from "react";
import { toast } from "sonner";
import { ChevronDown, Clock, Copy, FileText, MapPin, Star } from "lucide-react";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { StudioContactRow } from "@/components/studio/StudioContactLinks";
import { StudioHoursStatus, useHoursSummaryText } from "@/components/studio/StudioHoursStatus";
import { hoursSummary } from "@/lib/studioInfo/studioHours";
import {
  CONTACT_PURPOSES,
  hasLocalized,
  parseSimpleText,
  pickLocalized,
  safeHttpUrl,
  type ContactPurpose,
  type PublicPaymentDetails,
  type StudioInfo,
} from "@/lib/studioInfo/studioInfo";

export interface CabinetFooterData {
  studio: StudioInfo;
  payment: PublicPaymentDetails;
}

function SimpleText({ text }: { text: string }) {
  const blocks = parseSimpleText(text);
  return (
    <div className="space-y-1.5 text-xs leading-relaxed text-gray-600">
      {blocks.map((b, i) =>
        b.kind === "bullet" ? (
          <p key={i} className="flex gap-1.5">
            <span className="mt-[0.45rem] h-1 w-1 shrink-0 rounded-full bg-amber-500" aria-hidden />
            <span>{b.text}</span>
          </p>
        ) : (
          <p key={i}>{b.text}</p>
        ),
      )}
    </div>
  );
}

function Expandable({ title, text }: { title: string; text: string }) {
  return (
    <details className="group rounded-lg border border-gray-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-medium text-gray-800 [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown className="h-4 w-4 shrink-0 text-gray-400 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-t border-gray-100 px-3 py-2.5">
        <SimpleText text={text} />
      </div>
    </details>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">{children}</h2>;
}

/**
 * Customer cabinet footer: contacts by purpose, address + hours with a live
 * status, payment details with «copy IBAN», and short admin-editable texts.
 * Only public studio data reaches this component (see `CabinetShell`).
 */
export default function CabinetFooter({ data }: { data: CabinetFooterData }) {
  const { t, locale } = useLanguageStore();
  const f = t.footer;
  const { studio, payment } = data;

  const summary = useHoursSummaryText(useMemo(() => hoursSummary(studio.hours), [studio.hours]));
  const mapUrl = safeHttpUrl(studio.mapUrl);
  const reviewsUrl = safeHttpUrl(studio.reviewsUrl);
  const priceListUrl = safeHttpUrl(studio.priceListUrl);
  const artwork = hasLocalized(studio.artworkRequirements) ? pickLocalized(studio.artworkRequirements, locale) : "";
  const leadTimes = hasLocalized(studio.leadTimes) ? pickLocalized(studio.leadTimes, locale) : "";
  const purposeLabel: Record<ContactPurpose, string> = {
    platform: f.purposePlatform,
    wholesale: f.purposeWholesale,
    general: f.purposeGeneral,
  };
  const groups = CONTACT_PURPOSES.map((p) => ({
    purpose: p,
    contacts: studio.contacts.filter((c) => c.purpose === p),
  })).filter((g) => g.contacts.length > 0);

  const copyIban = async () => {
    try {
      await navigator.clipboard.writeText(payment.iban.replace(/\s+/g, ""));
      toast.success(f.ibanCopied);
    } catch {
      toast.error(f.copyFailed);
    }
  };

  const payRows: [string, string][] = [
    [f.payName, payment.name],
    [f.payFiscalCode, payment.fiscalCode],
    [f.payBank, payment.bankName],
    [f.payBic, payment.bic],
  ];

  return (
    <footer className="mt-8 border-t border-gray-200 bg-white pb-24 sm:pb-0">
      <div className="mx-auto grid w-full max-w-screen-2xl gap-8 px-4 py-6 sm:px-6 sm:py-8 md:grid-cols-2 lg:grid-cols-3 lg:px-8">
        {/* Contacts + address + hours */}
        <section className="space-y-4">
          <Heading>{f.contactsTitle}</Heading>
          {groups.map((g) => (
            <div key={g.purpose}>
              <p className="mb-1.5 text-xs text-gray-500">{purposeLabel[g.purpose]}</p>
              <div className="space-y-1.5">
                {g.contacts.map((c, i) => (
                  <StudioContactRow key={`${c.phone}-${i}`} contact={c} />
                ))}
              </div>
            </div>
          ))}

          <div className="space-y-1.5 border-t border-gray-100 pt-3 text-sm">
            <p className="flex items-start gap-1.5 text-gray-800">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
              <span>
                <span className="font-medium">{studio.studioName}</span>
                {studio.address ? <span className="block text-gray-600">{studio.address}</span> : null}
              </span>
            </p>
            <div className="flex flex-wrap gap-x-3 gap-y-1 pl-5 text-xs">
              {mapUrl ? (
                <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="text-amber-800 underline-offset-2 hover:underline">
                  {f.openMap}
                </a>
              ) : null}
              {reviewsUrl ? (
                <a
                  href={reviewsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-amber-800 underline-offset-2 hover:underline"
                >
                  <Star className="h-3 w-3" aria-hidden />
                  {f.reviews}
                </a>
              ) : null}
            </div>
          </div>

          <div className="space-y-1.5 text-sm">
            <p className="flex items-center gap-1.5 font-medium text-gray-800">
              <Clock className="h-3.5 w-3.5 text-gray-400" aria-hidden />
              {f.hoursTitle}
            </p>
            <div className="pl-5">
              <StudioHoursStatus hours={studio.hours} timezone={studio.timezone} />
              <p className="mt-1.5 text-xs leading-relaxed text-gray-600">
                {summary.rows.join(" · ")}
                {summary.lunch ? <span className="block text-gray-500">{summary.lunch}</span> : null}
              </p>
            </div>
          </div>
        </section>

        {/* Payment details */}
        <section>
          <Heading>{f.paymentTitle}</Heading>
          <dl className="space-y-1.5 text-sm">
            <div>
              <dt className="text-xs text-gray-500">{f.payIban}</dt>
              <dd className="flex flex-wrap items-center gap-2">
                <span className="break-all font-mono text-[13px] text-gray-900">{payment.iban}</span>
                <button
                  type="button"
                  onClick={copyIban}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-gray-200 bg-white px-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  <Copy className="h-3 w-3" aria-hidden />
                  {f.copyIban}
                </button>
              </dd>
            </div>
            {payRows.map(([label, value]) =>
              value ? (
                <div key={label}>
                  <dt className="text-xs text-gray-500">{label}</dt>
                  <dd className="text-gray-800">{value}</dd>
                </div>
              ) : null,
            )}
          </dl>
        </section>

        {/* Useful info */}
        {artwork || leadTimes || priceListUrl ? (
          <section className="space-y-2 md:col-span-2 lg:col-span-1">
            <Heading>{f.infoTitle}</Heading>
            {artwork ? <Expandable title={f.artworkTitle} text={artwork} /> : null}
            {leadTimes ? <Expandable title={f.leadTimesTitle} text={leadTimes} /> : null}
            {priceListUrl ? (
              <a
                href={priceListUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
              >
                <FileText className="h-4 w-4 text-gray-400" aria-hidden />
                {f.priceList}
              </a>
            ) : null}
          </section>
        ) : null}
      </div>
      <div className="border-t border-gray-100">
        <p className="mx-auto w-full max-w-screen-2xl px-4 py-3 text-xs text-gray-400 sm:px-6 lg:px-8" suppressHydrationWarning>
          {f.copyright(new Date().getFullYear())}
        </p>
      </div>
    </footer>
  );
}
