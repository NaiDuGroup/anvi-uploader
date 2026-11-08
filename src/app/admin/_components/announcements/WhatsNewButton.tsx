"use client";

import { Sparkles } from "lucide-react";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { cn } from "@/lib/utils";
import { useWhatsNew } from "./AnnouncementsProvider";

/** Unread dot for «Что нового» (header button, phone avatar / menu row). */
export function WhatsNewUnreadDot({ className }: { className?: string }) {
  const label = useLanguageStore((s) => s.t.announcements.menuUnread);
  return (
    <span
      className={cn("absolute h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-white", className)}
      role="status"
      aria-label={label}
      data-testid="whats-new-unread"
    />
  );
}

/** Desktop header: «Что нового» icon button next to the language switcher. */
export function WhatsNewButton() {
  const d = useLanguageStore((s) => s.t.announcements);
  const wn = useWhatsNew();
  if (!wn) return null;
  return (
    <button
      type="button"
      onClick={wn.open}
      className="relative hidden h-9 w-9 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-amber-50 hover:text-amber-700 sm:inline-flex"
      title={d.menuLabel}
      aria-label={d.menuLabel}
      data-testid="whats-new-button"
    >
      <Sparkles className="h-4 w-4" aria-hidden />
      {wn.unread ? <WhatsNewUnreadDot className="-right-1 -top-1" /> : null}
    </button>
  );
}

/** Phone avatar: dot while something is unseen. */
export function WhatsNewAvatarDot() {
  const wn = useWhatsNew();
  return wn?.unread ? <WhatsNewUnreadDot className="-right-0.5 -top-0.5" /> : null;
}
