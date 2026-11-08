import type { AnnouncementsDictionary } from "./types";

export const announcementsEn: AnnouncementsDictionary = {
  menuLabel: "What's new",
  menuUnread: "Something new",
  listTitle: "What's new",
  listEmpty: "Nothing new yet.",
  newBadge: "New",
  dismiss: "Got it",
  close: "Close",
  dateLocale: "en-GB",
  items: {
    "library-2026-11": {
      title: "New: Design library",
      listTitle: "Design library",
      intro: "Regular clients' designs can now be kept and reused.",
      steps: {
        save: "In an order, press «To library» next to a file — the design is saved.",
        insert: "In a new order, press «Add from library» and pick the saved design.",
        repeat: "«Repeat order» fills in the client, items and files for you.",
      },
      note: "Order files are deleted after 7 days; files in the library are kept for good.",
      action: "Open library",
    },
  },
};
