"use client";

import type { InputHTMLAttributes } from "react";
import { useShopLang } from "./ShopLangProvider";

/**
 * «Am citit și accept Termeni și condiții și politica de retur și am luat
 * cunoștință de Politica de confidențialitate» — required before «Pay» at
 * checkout and before «Plătește acum» on the order page. Each document opens
 * in a new tab; the plain text parts are labels of the checkbox.
 */
export function TermsConsent({
  id,
  checked,
  onChange,
  inputProps,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Extra attributes for the checkbox (aria-invalid / aria-describedby). */
  inputProps?: InputHTMLAttributes<HTMLInputElement>;
}) {
  const { t, href } = useShopLang();
  const labelId = `${id}-label`;
  const doc = (path: string, text: string) => (
    <a href={href(path)} target="_blank" rel="noopener"
      className="font-semibold underline decoration-1 underline-offset-2 hover:text-(--ink) hover:decoration-2 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ink)"
    >
      {text}
      <span className="sr-only"> {t("newTab")}</span>
    </a>
  );
  const label = (text: string) => (
    <label htmlFor={id} className="cursor-pointer">
      {text}
    </label>
  );
  return (
    <div className="flex items-start gap-3 text-sm leading-snug text-(--muted)">
      <input
        {...inputProps}
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-labelledby={labelId}
        className="mt-0.5 h-5 w-5 shrink-0 accent-(--ink) aria-invalid:rounded-sm aria-invalid:outline-2 aria-invalid:outline-offset-2 aria-invalid:outline-(--err)"
      />
      <span id={labelId}>
        {label(t("termsBefore"))}
        {doc("/shop/termeni", t("termsLinkText"))}
        {label(t("termsMiddle"))}
        {doc("/shop/retur", t("returnsLinkText"))}
        {label(t("privacyBefore"))}
        {doc("/shop/confidentialitate", t("privacyLinkText"))}
        {label(t("termsAfter"))}
      </span>
    </div>
  );
}
