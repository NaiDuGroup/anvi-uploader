"use client";

import { useShopLang } from "./ShopLangProvider";

const inputCls = "w-full rounded-[10px] border-[1.5px] border-(--line2) bg-(--soft) px-3.5 py-3 text-base font-medium";

export interface CompanyContactLink {
  label: string;
  href: string;
}

/**
 * «Cerere de ofertă» — the online form is not wired yet (pilot): the fields
 * are shown disabled and the box says where to write instead.
 */
export function CompanyRequestForm({ contacts }: { contacts: CompanyContactLink[] }) {
  const { t } = useShopLang();
  return (
    <form
      aria-labelledby="co-company-title"
      aria-describedby="co-company-note"
      onSubmit={(e) => e.preventDefault()}
      className="flex flex-col gap-3.5 rounded-2xl border-[1.5px] border-(--line) p-5 sm:p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="co-company-title" className="m-0 text-xl font-extrabold">
          {t("companiesFormTitle")}
        </h2>
        <span className="rounded-full bg-(--warn-soft) px-2.5 py-1 text-xs font-bold text-(--warn)">{t("inDevelopment")}</span>
      </div>
      <div id="co-company-note" className="flex flex-col gap-2 rounded-[10px] bg-(--warn-soft) px-3.5 py-3 text-sm">
        <span className="font-semibold text-(--warn)">
          {t("companiesFormNote")} {t("companiesWriteTo")}
        </span>
        <span className="flex flex-wrap gap-2">
          {contacts.map((c) => (
            <a
              key={c.href}
              href={c.href}
              className="inline-flex min-h-10 items-center rounded-lg bg-white px-3 font-bold no-underline"
            >
              {c.label}
            </a>
          ))}
        </span>
      </div>
      <fieldset disabled className="m-0 flex flex-col gap-3.5 border-0 p-0 opacity-60">
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          {t("companyName")}
          <input className={inputCls} autoComplete="organization" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          {t("phone")}
          <input className={inputCls} type="tel" autoComplete="tel" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          {t("companyMessage")}
          <textarea className={`${inputCls} min-h-28`} />
        </label>
        <button type="submit" className="rounded-xl bg-(--line2) py-3.5 font-extrabold text-(--muted)">
          {t("send")}
        </button>
      </fieldset>
    </form>
  );
}
