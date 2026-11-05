"use client";

import { useEffect, useMemo, useState } from "react";
import { Camera, MessageCircle, Moon, Phone, Send } from "lucide-react";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { DEFAULT_STUDIO_INFO } from "@/lib/studioInfo/studioInfo";
import {
  chatLinks,
  offHoursNotice,
  toOrderContactInfo,
  type ChatLink,
  type OrderContactInfo,
} from "@/lib/studioInfo/orderContact";

const FALLBACK = toOrderContactInfo(DEFAULT_STUDIO_INFO);

const ICONS: Record<ChatLink["kind"], typeof Phone> = {
  viber: Phone,
  telegram: Send,
  instagram: Camera,
};

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the textarea fallback
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Guest order success screen: off-hours notice (studio time zone, re-checked
 * every minute — the tab may stay open for hours) and «Написать нам» buttons
 * with the order number + tracking link prefilled.
 */
export function OrderSuccessContact({
  orderNumber,
  publicToken,
  info,
}: {
  /** Already padded, e.g. `0042`. */
  orderNumber: string;
  publicToken: string;
  info?: OrderContactInfo;
}) {
  const { t } = useLanguageStore();
  const c = t.success.contact;
  const { hours, timezone, chat } = info ?? FALLBACK;

  // Success screen renders only after a client-side submit, so `window` / `Date` are safe here.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const notice = offHoursNotice(hours, now, timezone, c);

  const trackUrl = typeof window === "undefined" ? `/track/${publicToken}` : `${window.location.origin}/track/${publicToken}`;
  const message = c.message(orderNumber, trackUrl);
  const links = useMemo(() => chatLinks(chat, message), [chat, message]);

  const [hint, setHint] = useState<string | null>(null);
  useEffect(() => {
    if (!hint) return;
    const id = window.setTimeout(() => setHint(null), 6000);
    return () => window.clearTimeout(id);
  }, [hint]);

  if (!links.length && !notice) return null;

  return (
    <div className="mt-6 text-left" data-testid="order-success-contact">
      {notice ? (
        <div
          className="mb-4 flex gap-3 rounded-xl bg-gold-light p-3 text-sm text-gold-text"
          role="status"
          data-testid="order-success-closed"
        >
          <Moon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            <span className="font-semibold">{notice.title}</span> {notice.body}
          </p>
        </div>
      ) : null}
      {links.length ? (
        <>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
            <MessageCircle className="h-4 w-4 text-gold" aria-hidden />
            {c.title}
          </p>
          <p className="mb-3 mt-0.5 text-xs text-gray-500">{c.hint}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            {links.map((l) => {
              const Icon = ICONS[l.kind];
              const external = l.href.startsWith("https://");
              return (
                <a
                  key={l.kind}
                  href={l.href}
                  {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  onClick={
                    l.copyMessage
                      ? () => {
                          void copyText(message).then((ok) => setHint(ok ? c.copiedHint : c.copyFailed));
                        }
                      : undefined
                  }
                  className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-gold px-4 text-sm font-semibold text-gold-text transition-colors hover:bg-gold-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                  data-testid={`order-success-${l.kind}`}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {l.label}
                </a>
              );
            })}
          </div>
          {hint ? (
            <p className="mt-2 text-xs text-gray-600" role="status" aria-live="polite">
              {hint}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
