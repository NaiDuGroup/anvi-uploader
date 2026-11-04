"use client";

import { useState } from "react";
import type { CustomerFile } from "@/lib/shop/account/accountRules";
import type { CheckoutDraft } from "@/lib/storefront/checkoutDraft";
import { formatOrderDate } from "@/lib/storefront/format";
import { FileIcon } from "../ShopIcons";
import { useShopLang } from "../ShopLangProvider";

const inputCls =
  "w-full rounded-[10px] border-[1.5px] border-(--line2) bg-white px-3.5 py-3 text-base font-medium text-(--ink) aria-[invalid=true]:border-(--err)";
const labelCls = "text-sm font-semibold";

function sizeText(bytes: number | null): string {
  if (bytes == null || !(bytes > 0)) return "";
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** «Fișierele mele»: stored order files; delete (refused while an order in work needs the file). */
export function AccountFilesClient({ initial }: { initial: CustomerFile[] }) {
  const { t, lang } = useShopLang();
  const [files, setFiles] = useState<CustomerFile[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ key: string; text: string } | null>(null);

  const remove = async (f: CustomerFile) => {
    if (!window.confirm(t("accFileDeleteConfirm", { name: f.name }))) return;
    setBusy(f.key);
    setMsg(null);
    try {
      const res = await fetch("/api/shop/account/files", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: f.key }),
      });
      const body = (await res.json().catch(() => null)) as { orders?: number[] } | null;
      if (res.ok) setFiles((list) => list.filter((x) => x.key !== f.key));
      else if (res.status === 409) setMsg({ key: f.key, text: t("accFileInUse", { list: (body?.orders ?? f.inUseBy).join(", ") }) });
      else setMsg({ key: f.key, text: t("accError") });
    } catch {
      setMsg({ key: f.key, text: t("errNetwork") });
    }
    setBusy(null);
  };

  if (files.length === 0) return <p className="m-0 text-lg text-(--muted)">{t("accFilesEmpty")}</p>;
  return (
    <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
      {files.map((f) => (
        <li key={f.key} className="flex flex-col gap-2 rounded-[14px] border-[1.5px] border-(--line) px-4 py-3">
          <div className="flex items-center gap-3">
            <FileIcon size={22} />
            <div className="flex min-w-0 flex-1 flex-col">
              <b className="truncate">{f.name}</b>
              <span className="text-sm text-(--muted)">
                {[formatOrderDate(f.createdAt, lang), sizeText(f.sizeBytes), t("accFileOrders", { list: f.orderNumbers.map((n) => `#${n}`).join(", ") })]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
            <button
              type="button"
              onClick={() => remove(f)}
              disabled={busy === f.key || f.inUseBy.length > 0}
              aria-label={t("accFileDeleteAria", { name: f.name })}
              className="inline-flex min-h-10 items-center rounded-lg px-2 font-semibold underline disabled:no-underline disabled:opacity-50"
            >
              {t("accFileDelete")}
            </button>
          </div>
          {f.inUseBy.length ? (
            <span className="text-sm text-(--muted2)">{t("accFileInUse", { list: f.inUseBy.join(", ") })}</span>
          ) : null}
          {msg?.key === f.key ? (
            <span role="alert" className="text-sm font-semibold text-(--err)">
              {msg.text}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** «Datele mele»: name, phone and the saved delivery (prefill the checkout). */
export function AccountDetailsForm({ initial }: { initial: CheckoutDraft }) {
  const { t } = useShopLang();
  const [f, setF] = useState<CheckoutDraft>(initial);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<"idle" | "saved" | "error" | "invalid">("idle");
  const [bad, setBad] = useState<string[]>([]);
  const set = <K extends keyof CheckoutDraft>(k: K, v: CheckoutDraft[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    setState("idle");
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const phone = f.phone.replace(/\D/g, "").length > 3 ? f.phone : "";
      const res = await fetch("/api/shop/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: f.name, phone, delivery: { method: f.method, city: f.city, address: f.address, note: f.note } }),
      });
      const body = (await res.json().catch(() => null)) as { fields?: string[] } | null;
      if (res.ok) {
        setState("saved");
        setBad([]);
      } else if (res.status === 400) {
        setState("invalid");
        setBad(body?.fields ?? []);
      } else setState("error");
    } catch {
      setState("error");
    }
    setBusy(false);
  };
  const methods = [
    { id: "pickup" as const, name: t("pickup") },
    { id: "courier_chisinau" as const, name: t("courierCity") },
    { id: "courier_moldova" as const, name: t("courierCountry") },
  ];
  return (
    <form onSubmit={save} noValidate className="flex max-w-xl flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelCls}>{t("accEmail")}</span>
        <span className="text-(--muted)">{f.email}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="acc-name" className={labelCls}>
          {t("name")}
        </label>
        <input id="acc-name" className={inputCls} autoComplete="name" value={f.name} onChange={(e) => set("name", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="acc-phone" className={labelCls}>
          {t("phone")}
        </label>
        <input
          id="acc-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          aria-invalid={bad.includes("phone") ? true : undefined}
          className={inputCls}
          value={f.phone}
          onChange={(e) => set("phone", e.target.value)}
        />
        {bad.includes("phone") ? <span className="text-sm font-semibold text-(--err)">{t("errPhone")}</span> : null}
      </div>
      <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
        <legend className="mb-2 text-lg font-extrabold">{t("accDeliveryTitle")}</legend>
        {methods.map((m) => (
          <label key={m.id} className="flex min-h-11 cursor-pointer items-center gap-3">
            <input type="radio" name="acc-method" checked={f.method === m.id} onChange={() => set("method", m.id)} />
            {m.name}
          </label>
        ))}
      </fieldset>
      {f.method !== "pickup" ? (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="acc-city" className={labelCls}>
              {t("city")}
            </label>
            <input id="acc-city" className={inputCls} autoComplete="address-level2" value={f.city} onChange={(e) => set("city", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="acc-address" className={labelCls}>
              {t("address")}
            </label>
            <input id="acc-address" className={inputCls} autoComplete="street-address" value={f.address} onChange={(e) => set("address", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="acc-note" className={labelCls}>
              {t("courierNote")}
            </label>
            <input id="acc-note" className={inputCls} value={f.note} onChange={(e) => set("note", e.target.value)} />
          </div>
        </>
      ) : null}
      <button type="submit" disabled={busy} className="shop-btn-dark self-start rounded-xl bg-(--ink) px-6 py-3.5 font-bold text-white disabled:opacity-60">
        {busy ? t("accSaving") : t("accSave")}
      </button>
      <span role="status" className="text-sm font-semibold">
        {state === "saved" ? <span className="text-(--ok)">{t("accDetailsSaved")}</span> : null}
        {state === "error" ? <span className="text-(--err)">{t("accError")}</span> : null}
        {state === "invalid" && !bad.includes("phone") ? <span className="text-(--err)">{t("accError")}</span> : null}
      </span>
    </form>
  );
}
