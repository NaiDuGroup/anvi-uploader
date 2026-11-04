"use client";

import { useState } from "react";
import { useShopLang } from "./ShopLangProvider";

const inputCls = "w-full rounded-[10px] border-[1.5px] border-(--line2) bg-white px-3.5 py-3 text-base font-medium";

/** «Cerere de ofertă» — the online form is not wired yet (pilot): it only explains how to reach us. */
export function CompanyRequestForm() {
  const { t } = useShopLang();
  const [shown, setShown] = useState(false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setShown(true);
      }}
      className="flex flex-col gap-3.5 rounded-2xl border-[1.5px] border-(--line) p-5 sm:p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 text-xl font-extrabold">{t("companiesFormTitle")}</h2>
        <span className="rounded-full bg-(--warn-soft) px-2.5 py-1 text-xs font-bold text-(--warn)">{t("inDevelopment")}</span>
      </div>
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
      {shown ? (
        <p role="status" className="m-0 rounded-[10px] bg-(--warn-soft) px-3.5 py-2.5 text-sm font-semibold text-(--warn)">
          {t("companiesFormNote")}
        </p>
      ) : null}
      <button type="submit" className="shop-btn-dark rounded-xl bg-(--ink) py-3.5 font-extrabold">
        {t("send")}
      </button>
    </form>
  );
}
