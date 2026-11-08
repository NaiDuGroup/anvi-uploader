import type { AnnouncementId } from "@/lib/announcements";

/** Texts of one announcement (registry entry in `src/lib/announcements.ts`). */
export interface AnnouncementText {
  /** One-time modal title («Новое: …»). */
  title: string;
  /** Title in the «Что нового» list (no «Новое:» prefix). */
  listTitle: string;
  /** One line under the title. */
  intro: string;
  /** Step texts by the registry step `key`. */
  steps: Record<string, string>;
  /** Short note under the steps. */
  note: string;
  /** Label of the button that opens the registry `href`. */
  action: string;
}

/** «Что нового»: one-time announcement modal, list in the header / phone menu, hints. */
export interface AnnouncementsDictionary {
  menuLabel: string;
  menuUnread: string;
  listTitle: string;
  listEmpty: string;
  newBadge: string;
  dismiss: string;
  close: string;
  dateLocale: string;
  items: Record<AnnouncementId, AnnouncementText>;
}
