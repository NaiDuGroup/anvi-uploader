"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { hintKey, isHintVisible, type AnnouncementId } from "@/lib/announcements";
import { isFullScreenPage } from "../AdminFooter";
import { AnnouncementModal, WhatsNewDialog } from "./AnnouncementDialogs";

/** Server-computed in the protected admin layout (no flash, no client clock). */
export type AnnouncementsInitial = {
  seen: string[];
  activeIds: string[];
  pendingIds: string[];
};

type Ctx = {
  role: string;
  seen: string[];
  activeIds: string[];
  /** Something active is still unseen (dot on «Что нового»). */
  unread: boolean;
  markSeen: (key: string) => void;
  openList: () => void;
};

const AnnouncementsContext = createContext<Ctx | null>(null);

function postSeen(id: string) {
  void fetch("/api/admin/announcements/seen", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
    keepalive: true,
  }).catch(() => {});
}

/**
 * «Что нового» for staff: shows the oldest unseen active announcement once per
 * page load, hosts the «Что нового» list and feeds the contextual hints.
 */
export function AnnouncementsProvider({
  role,
  initial,
  children,
}: {
  role: string;
  initial: AnnouncementsInitial;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [seen, setSeen] = useState<string[]>(initial.seen);
  const seenRef = useRef(new Set(initial.seen));
  const [modalId, setModalId] = useState<string | null>(initial.pendingIds[0] ?? null);
  const [listOpen, setListOpen] = useState(false);
  // The dialogs portal to <body>: render them only after hydration.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const markSeen = useCallback((key: string) => {
    if (seenRef.current.has(key)) return;
    seenRef.current.add(key);
    setSeen((s) => [...s, key]);
    postSeen(key);
  }, []);

  const unread = initial.pendingIds.some((id) => !seen.includes(id));
  const openList = useCallback(() => setListOpen(true), []);

  const value = useMemo<Ctx>(
    () => ({ role, seen, activeIds: initial.activeIds, unread, markSeen, openList }),
    [role, seen, initial.activeIds, unread, markSeen, openList],
  );

  const closeModal = (href?: string) => {
    if (modalId) markSeen(modalId);
    setModalId(null);
    if (href && pathname !== href) router.push(href);
  };

  return (
    <AnnouncementsContext.Provider value={value}>
      {children}
      {/* Full-screen tools (Studio editor): the modal waits for an ordinary page. */}
      {mounted && modalId && !isFullScreenPage(pathname) ? <AnnouncementModal id={modalId} role={role} onClose={closeModal} /> : null}
      {listOpen ? (
        <WhatsNewDialog
          role={role}
          unseenIds={initial.pendingIds.filter((id) => !seen.includes(id))}
          onOpened={(ids) => ids.forEach(markSeen)}
          onClose={() => setListOpen(false)}
          onNavigate={(href) => {
            setListOpen(false);
            if (pathname !== href) router.push(href);
          }}
        />
      ) : null}
    </AnnouncementsContext.Provider>
  );
}

/** «Что нового» entry points (header button, phone menu). Null outside the admin shell. */
export function useWhatsNew(): { unread: boolean; open: () => void } | null {
  const ctx = useContext(AnnouncementsContext);
  return ctx ? { unread: ctx.unread, open: ctx.openList } : null;
}

/**
 * Contextual «new» hint for a button while its announcement is active; hidden
 * for good once the user has used the feature (`markUsed` on click). Outside the
 * admin shell (dealer cabinet) it never shows.
 */
export function useAnnouncementHint(id: AnnouncementId, hint: string): { visible: boolean; markUsed: () => void } {
  const ctx = useContext(AnnouncementsContext);
  const visible = ctx ? isHintVisible(id, hint, ctx.activeIds, ctx.seen) : false;
  const markSeen = ctx?.markSeen;
  const markUsed = useCallback(() => {
    if (visible && markSeen) markSeen(hintKey(id, hint));
  }, [visible, markSeen, id, hint]);
  return { visible, markUsed };
}
