/**
 * «Что нового» — staff announcements registry (admin / superadmin / workshop only).
 *
 * Add an entry here + its texts in `src/lib/i18n/announcements/{ru,ro,en}.ts`
 * (`items[id]`). Each staff user sees an active announcement once as a modal
 * (oldest unseen first, one per page load); every announcement — seen or
 * expired — stays readable in «Что нового» in the header / phone menu.
 *
 * Seen state lives in `User.seenAnnouncements` (announcement ids and hint keys
 * `<id>:<hint>`), written by `POST /api/admin/announcements/seen`.
 *
 * Pure module (no React / Prisma) so the filtering is unit-tested.
 */

export const STAFF_ROLES = ["admin", "superadmin", "workshop"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** Icon names the client maps to lucide icons (same icons as the real buttons). */
export type AnnouncementIcon = "bookmarkPlus" | "bookMarked" | "repeat";

export type AnnouncementStep = {
  /** Key into the dictionary's `items[id].steps`. */
  key: string;
  icon: AnnouncementIcon;
  /** Omit = every role the announcement is for. */
  roles?: readonly StaffRole[];
};

export type Announcement = {
  id: string;
  /** First moment the announcement is active (ISO, inclusive). */
  startsAt: string;
  /** After this moment: no modal, no hints — only the «Что нового» list (ISO, exclusive). */
  until: string;
  roles: readonly StaffRole[];
  steps: readonly AnnouncementStep[];
  /** «Открыть …» button target (label in `items[id].action`). */
  href?: string;
  /** Contextual hint names; each is «seen» under `<id>:<hint>`. */
  hints?: readonly string[];
};

export const ANNOUNCEMENTS = [
  {
    id: "library-2026-11",
    startsAt: "2026-11-08T00:00:00+02:00",
    until: "2026-12-01T00:00:00+02:00",
    roles: STAFF_ROLES,
    href: "/admin/library",
    steps: [
      { key: "save", icon: "bookmarkPlus" },
      { key: "insert", icon: "bookMarked" },
      // The workshop doesn't see «Повторить заказ» in the orders list.
      { key: "repeat", icon: "repeat", roles: ["admin", "superadmin"] },
    ],
    hints: ["save-hint", "pick-hint"],
  },
] as const satisfies readonly Announcement[];

export type AnnouncementId = (typeof ANNOUNCEMENTS)[number]["id"];

export function isStaffRole(role: string): role is StaffRole {
  return (STAFF_ROLES as readonly string[]).includes(role);
}

export function hintKey(id: string, hint: string): string {
  return `${id}:${hint}`;
}

function time(iso: string): number {
  return new Date(iso).getTime();
}

export function isAnnouncementActive(a: Announcement, now: Date): boolean {
  const t = now.getTime();
  return time(a.startsAt) <= t && t < time(a.until);
}

function forRole(a: Announcement, role: string): boolean {
  return isStaffRole(role) && a.roles.includes(role);
}

/** «Что нового» list: everything already started for this role, newest first. */
export function announcementsForRole(
  role: string,
  now: Date,
  list: readonly Announcement[] = ANNOUNCEMENTS,
): Announcement[] {
  return list
    .filter((a) => forRole(a, role) && time(a.startsAt) <= now.getTime())
    .sort((a, b) => time(b.startsAt) - time(a.startsAt));
}

/** Active announcements for this role (modal / hints window), oldest first. */
export function activeAnnouncementIds(
  role: string,
  now: Date,
  list: readonly Announcement[] = ANNOUNCEMENTS,
): string[] {
  return list
    .filter((a) => forRole(a, role) && isAnnouncementActive(a, now))
    .sort((a, b) => time(a.startsAt) - time(b.startsAt))
    .map((a) => a.id);
}

/** Active announcements this user hasn't seen yet, oldest first (the modal shows the first). */
export function pendingAnnouncementIds(
  role: string,
  seen: readonly string[],
  now: Date,
  list: readonly Announcement[] = ANNOUNCEMENTS,
): string[] {
  return activeAnnouncementIds(role, now, list).filter((id) => !seen.includes(id));
}

/** Steps of an announcement that fit the role (e.g. no «Повторить заказ» for the workshop). */
export function stepsForRole(a: Announcement, role: string): AnnouncementStep[] {
  return a.steps.filter((s) => !s.roles || (isStaffRole(role) && s.roles.includes(role)));
}

/** A contextual hint shows while its announcement is active and the user hasn't used the feature. */
export function isHintVisible(
  id: string,
  hint: string,
  activeIds: readonly string[],
  seen: readonly string[],
  list: readonly Announcement[] = ANNOUNCEMENTS,
): boolean {
  const a = list.find((x) => x.id === id);
  if (!a || !a.hints?.includes(hint)) return false;
  return activeIds.includes(id) && !seen.includes(hintKey(id, hint));
}

/** Keys the «seen» endpoint accepts: announcement ids and their hint keys. */
export function isKnownSeenKey(key: string, list: readonly Announcement[] = ANNOUNCEMENTS): boolean {
  return list.some((a) => a.id === key || (a.hints ?? []).some((h) => hintKey(a.id, h) === key));
}

export function findAnnouncement(id: string, list: readonly Announcement[] = ANNOUNCEMENTS): Announcement | undefined {
  return list.find((a) => a.id === id);
}
