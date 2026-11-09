"use client";

import { useState } from "react";
import { Loader2, Wallet } from "lucide-react";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { cn } from "@/lib/utils";

type Locale = "ro" | "ru" | "en";

const L: Record<Locale, { title: string; hint: string; on: string; off: string; failed: string }> = {
  ru: {
    title: "Оплата только при получении (временно)",
    hint: "Онлайн-оплата скрыта, клиенты оформляют заказ и платят при получении. Заказы сразу идут в работу с пометкой «оплата при получении».",
    on: "Включено",
    off: "Выключено — онлайн-оплата",
    failed: "Не удалось сохранить, попробуйте ещё раз",
  },
  ro: {
    title: "Plata doar la primire (temporar)",
    hint: "Plata online e ascunsă, clienții plasează comanda și plătesc la primire. Comenzile intră imediat în lucru, marcate «plata la primire».",
    on: "Pornit",
    off: "Oprit — plată online",
    failed: "Nu s-a salvat, încercați din nou",
  },
  en: {
    title: "Pay on delivery only (temporary)",
    hint: "Online payment is hidden: customers place the order and pay on delivery. Orders go straight to work, marked «pay on delivery».",
    on: "On",
    off: "Off — online payment",
    failed: "Could not save, try again",
  },
};

/** «Сайт» (super admin): the storefront pay-on-delivery switch (`/api/admin/shop/payment-mode`). */
export default function ShopPayOnDeliveryToggle({ initial }: { initial: boolean }) {
  const locale = useLanguageStore((s) => s.locale) as Locale;
  const l = L[locale] ?? L.ru;
  const [on, setOn] = useState<boolean>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const toggle = async () => {
    const next = !on;
    setBusy(true);
    setError(false);
    try {
      const res = await fetch("/api/admin/shop/payment-mode", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payOnDelivery: next }),
      });
      const body = (await res.json().catch(() => null)) as { payOnDelivery?: unknown } | null;
      if (!res.ok || typeof body?.payOnDelivery !== "boolean") throw new Error(String(res.status));
      setOn(body.payOnDelivery);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 pt-4 sm:px-5">
      <div
        className={cn(
          "flex items-start gap-3 rounded-xl border px-4 py-3",
          on ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-white",
        )}
      >
        <Wallet className={cn("mt-0.5 h-5 w-5 shrink-0", on ? "text-amber-700" : "text-gray-400")} aria-hidden />
        <div className="min-w-0 flex-1">
          <p id="shop-pod-title" className="m-0 text-sm font-semibold text-gray-900">
            {l.title}
          </p>
          <p className="m-0 mt-0.5 text-xs text-gray-600">{l.hint}</p>
          {error ? (
            <p role="alert" className="m-0 mt-1 text-xs font-medium text-red-600">
              {l.failed}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden text-xs font-medium text-gray-600 sm:inline">{on ? l.on : l.off}</span>
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-labelledby="shop-pod-title"
            disabled={busy}
            onClick={() => void toggle()}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 outline-none ring-1 ring-inset focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2",
              on ? "bg-emerald-500 ring-emerald-600/30 hover:bg-emerald-600" : "bg-slate-300 ring-slate-400/40 hover:bg-slate-400",
              busy && "cursor-not-allowed opacity-60",
            )}
          >
            <span
              className={cn(
                "pointer-events-none inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow ring-1 ring-black/5 transition-transform duration-200",
                on ? "translate-x-[22px]" : "translate-x-0.5",
              )}
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin text-gray-500" /> : null}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
