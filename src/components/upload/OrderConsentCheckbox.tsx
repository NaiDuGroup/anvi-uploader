"use client";

import { useId } from "react";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { privacyPolicyUrl } from "@/lib/orderConsent";

/**
 * The single required checkbox of the guest upload forms: files checked, the
 * right to print them, and consent to the processing of personal data (with
 * an inline link to the privacy policy). Submit stays disabled until ticked;
 * the form then sends `consent: orderConsentPayload()`.
 */
export function OrderConsentCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const { t, locale } = useLanguageStore();
  const id = useId();

  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        required
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 flex-shrink-0 rounded border-gray-300 cursor-pointer accent-gold"
        data-testid="upload-gdpr-checkbox"
      />
      <label htmlFor={id} className="text-sm text-gray-700 leading-snug cursor-pointer select-none">
        {t.upload.gdprConsentBefore}
        <a
          href={privacyPolicyUrl(locale)}
          target="_blank"
          rel="noopener"
          className="text-gold-text underline underline-offset-2 hover:no-underline"
        >
          {t.upload.gdprConsentLink}
        </a>
        {t.upload.gdprConsentAfter}
      </label>
    </div>
  );
}
