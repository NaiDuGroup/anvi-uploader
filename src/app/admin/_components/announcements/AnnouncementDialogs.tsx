"use client";

import { useEffect, useRef } from "react";
import { BookMarked, BookmarkCheck, BookmarkPlus, Repeat2, Sparkles, type LucideIcon } from "lucide-react";
import {
  announcementsForRole,
  findAnnouncement,
  stepsForRole,
  type Announcement,
  type AnnouncementIcon,
  type AnnouncementId,
} from "@/lib/announcements";
import type { AnnouncementText } from "@/lib/i18n/announcements/types";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { LibrarySheet, sheetCancelClass, sheetPrimaryClass } from "../library/LibrarySheet";

/** Same icons as the real buttons the steps talk about. */
const ICONS: Record<AnnouncementIcon, LucideIcon> = {
  bookmarkPlus: BookmarkPlus,
  bookMarked: BookMarked,
  repeat: Repeat2,
};

function useAnnouncementText(id: string): AnnouncementText | undefined {
  const items = useLanguageStore((s) => s.t.announcements.items);
  return items[id as AnnouncementId];
}

/** Intro + numbered steps with icons + note (shared by the modal and the list). */
function AnnouncementBody({ a, role, text }: { a: Announcement; role: string; text: AnnouncementText }) {
  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-gray-600">{text.intro}</p>
      <ol className="space-y-2.5">
        {stepsForRole(a, role).map((step) => {
          const Icon = ICONS[step.icon];
          return (
            <li key={step.key} className="flex items-start gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                aria-hidden
              >
                <Icon className="h-[1.125rem] w-[1.125rem]" />
              </span>
              <span className="pt-1.5 text-sm leading-snug text-gray-800">{text.steps[step.key]}</span>
            </li>
          );
        })}
      </ol>
      <p className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs leading-snug text-emerald-800 ring-1 ring-emerald-100">
        <BookmarkCheck className="mt-px h-4 w-4 shrink-0" aria-hidden />
        <span>{text.note}</span>
      </p>
    </div>
  );
}

/**
 * One-time announcement. Any close (× / Esc / backdrop / «Понятно») counts as
 * seen; the action button also opens the announcement's page.
 */
export function AnnouncementModal({
  id,
  role,
  onClose,
}: {
  id: string;
  role: string;
  onClose: (href?: string) => void;
}) {
  const d = useLanguageStore((s) => s.t.announcements);
  const text = useAnnouncementText(id);
  const a = findAnnouncement(id);
  if (!a || !text) return null;
  return (
    <LibrarySheet
      title={text.title}
      icon={<Sparkles className="h-5 w-5 shrink-0 text-amber-600" aria-hidden />}
      onClose={() => onClose()}
      testId="announcement-modal"
      footer={
        <>
          <button type="button" className={sheetCancelClass} onClick={() => onClose()} data-testid="announcement-dismiss">
            {d.dismiss}
          </button>
          {a.href ? (
            <button
              type="button"
              className={sheetPrimaryClass}
              onClick={() => onClose(a.href)}
              data-testid="announcement-action"
            >
              {text.action}
            </button>
          ) : null}
        </>
      }
    >
      <AnnouncementBody a={a} role={role} text={text} />
    </LibrarySheet>
  );
}

function ListItem({
  a,
  role,
  isNew,
  onNavigate,
}: {
  a: Announcement;
  role: string;
  isNew: boolean;
  onNavigate: (href: string) => void;
}) {
  const d = useLanguageStore((s) => s.t.announcements);
  const text = useAnnouncementText(a.id);
  if (!text) return null;
  const date = new Date(a.startsAt).toLocaleDateString(d.dateLocale, { day: "numeric", month: "long", year: "numeric" });
  return (
    <li className="rounded-xl border border-gray-200 p-3 sm:p-4" data-testid="whats-new-item">
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="text-sm font-semibold text-gray-900">{text.listTitle}</h3>
        {isNew ? (
          <span className="rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-amber-800">
            {d.newBadge}
          </span>
        ) : null}
        <span className="ml-auto text-xs text-gray-400">{date}</span>
      </div>
      <AnnouncementBody a={a} role={role} text={text} />
      {a.href ? (
        <button
          type="button"
          onClick={() => onNavigate(a.href!)}
          className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-amber-700 hover:text-amber-900 hover:underline"
        >
          {text.action} →
        </button>
      ) : null}
    </li>
  );
}

/** «Что нового»: every announcement for the role (seen and expired too), newest first. */
export function WhatsNewDialog({
  role,
  unseenIds,
  onOpened,
  onClose,
  onNavigate,
}: {
  role: string;
  unseenIds: string[];
  /** Called once with the unseen ids shown — reading them here counts as seen. */
  onOpened: (ids: string[]) => void;
  onClose: () => void;
  onNavigate: (href: string) => void;
}) {
  const d = useLanguageStore((s) => s.t.announcements);
  // «Новое» chips keep showing while the list is open even though they're marked seen.
  const newIds = useRef(unseenIds).current;
  const list = announcementsForRole(role, new Date());
  useEffect(() => {
    if (newIds.length) onOpened(newIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opening
  }, []);
  return (
    <LibrarySheet
      title={d.listTitle}
      icon={<Sparkles className="h-5 w-5 shrink-0 text-amber-600" aria-hidden />}
      onClose={onClose}
      testId="whats-new-list"
    >
      {list.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">{d.listEmpty}</p>
      ) : (
        <ul className="space-y-3 pb-2">
          {list.map((a) => (
            <ListItem key={a.id} a={a} role={role} isNew={newIds.includes(a.id)} onNavigate={onNavigate} />
          ))}
        </ul>
      )}
    </LibrarySheet>
  );
}
