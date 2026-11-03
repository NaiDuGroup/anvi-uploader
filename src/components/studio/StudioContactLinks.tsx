"use client";

import { MessageCircle, Phone, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguageStore } from "@/stores/useLanguageStore";
import {
  formatPhone,
  telegramHref,
  telHref,
  viberHref,
  whatsappHref,
  type StudioContact,
} from "@/lib/studioInfo/studioInfo";

const iconBtn =
  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1";

/** One contact: name + tel: link, then Viber / WhatsApp / Telegram round buttons. */
export function StudioContactRow({
  contact,
  compact = false,
}: {
  contact: Pick<StudioContact, "name" | "phone" | "viber" | "whatsapp" | "telegram">;
  compact?: boolean;
}) {
  const { t } = useLanguageStore();
  const f = t.footer;
  const name = contact.name.trim() || f.studioLabel;
  const phone = formatPhone(contact.phone);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <a
        href={telHref(contact.phone)}
        className={cn(
          "inline-flex min-w-0 items-center gap-1.5 text-gray-800 hover:text-amber-800",
          compact ? "text-xs" : "text-sm",
        )}
        aria-label={f.call(`${name}, ${phone}`)}
      >
        <Phone className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
        <span className="font-medium">{name}</span>
        <span className="whitespace-nowrap tabular-nums text-gray-600">{phone}</span>
      </a>
      <span className="inline-flex items-center gap-1">
        {contact.viber ? (
          <a
            href={viberHref(contact.phone)}
            className={cn(iconBtn, "bg-[#7360f2] focus-visible:ring-[#7360f2]", compact && "h-6 w-6")}
            title={f.viber}
            aria-label={`${f.viber}: ${name}`}
          >
            <MessageCircle className="h-3.5 w-3.5" aria-hidden />
          </a>
        ) : null}
        {contact.whatsapp ? (
          <a
            href={whatsappHref(contact.phone)}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(iconBtn, "bg-[#25d366] focus-visible:ring-[#25d366]", compact && "h-6 w-6")}
            title={f.whatsapp}
            aria-label={`${f.whatsapp}: ${name}`}
          >
            <MessageCircle className="h-3.5 w-3.5" aria-hidden />
          </a>
        ) : null}
        {contact.telegram ? (
          <a
            href={telegramHref(contact.phone)}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(iconBtn, "bg-[#229ed9] focus-visible:ring-[#229ed9]", compact && "h-6 w-6")}
            title={f.telegram}
            aria-label={`${f.telegram}: ${name}`}
          >
            <Send className="h-3.5 w-3.5" aria-hidden />
          </a>
        ) : null}
      </span>
    </div>
  );
}
