"use client";

import { useState } from "react";
import { lfText, type LfTextKey } from "@/lib/storefront/largeFormatText";
import { useShopLang } from "./ShopLangProvider";

/** What the studio makes with its partner (CASALOT) or by hand: asked for, not sold in the cart. */
export const LF_ON_REQUEST_ITEMS: readonly LfTextKey[] = [
  "onRequestOneWay",
  "onRequestPlastic",
  "onRequestCut",
  "onRequestLam",
  "onRequestWide",
  "onRequestTriptych",
  "onRequestBacklit",
];

export interface LfRequestContact {
  label: string;
  /** WhatsApp / Telegram links take the prepared message as `?text=`; others open as they are. */
  href: string;
  withText: boolean;
}

/**
 * «La cerere»: pick what you need, and the message to the studio is prepared
 * for WhatsApp / Telegram (Viber and the phone open without it). Nothing is
 * sent from the site.
 */
export function LfOnRequest({ contacts }: { contacts: LfRequestContact[] }) {
  const { lang } = useShopLang();
  const lt = lfText(lang);
  const [item, setItem] = useState<LfTextKey>(LF_ON_REQUEST_ITEMS[0]!);
  const message: string = lt("onRequestMessage", { item: lt(item) });
  return (
    <section id="la-cerere" aria-labelledby="h-lf-req" className="flex scroll-mt-4 flex-col gap-4 rounded-2xl border-[1.5px] border-(--line) p-5 sm:p-6">
      <div className="flex flex-col gap-1.5">
        <h2 id="h-lf-req" className="m-0 text-2xl font-extrabold">
          {lt("onRequestTitle")}
        </h2>
        <p className="m-0 text-(--muted)">{lt("onRequestText")}</p>
      </div>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="sr-only">{lt("onRequestTitle")}</legend>
        {LF_ON_REQUEST_ITEMS.map((k) => (
          <label key={k} className="flex min-h-10 items-center gap-3">
            <input type="radio" name="lf-request" checked={item === k} onChange={() => setItem(k)} className="h-5 w-5" />
            <span>{lt(k)}</span>
          </label>
        ))}
      </fieldset>
      <p className="m-0 rounded-[10px] bg-(--soft) px-3.5 py-3 text-sm">{message}</p>
      <div className="flex flex-wrap gap-2">
        {contacts.map((c) => (
          <a
            key={c.href}
            href={c.withText ? `${c.href}?text=${encodeURIComponent(message)}` : c.href}
            target={c.href.startsWith("http") ? "_blank" : undefined}
            rel={c.href.startsWith("http") ? "noopener noreferrer" : undefined}
            className="inline-flex min-h-11 items-center rounded-[10px] bg-(--ink) px-4 font-bold text-white no-underline"
          >
            {c.label}
          </a>
        ))}
      </div>
    </section>
  );
}
