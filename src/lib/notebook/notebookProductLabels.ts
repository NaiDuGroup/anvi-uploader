import type { Locale } from "@/lib/i18n";

export function notebookProductDisplayName(
  p: { nameRo: string; nameRu: string; nameEn: string },
  locale: Locale,
): string {
  switch (locale) {
    case "ru":
      return p.nameRu;
    case "en":
      return p.nameEn;
    case "ro":
    default:
      return p.nameRo;
  }
}

export function notebookProductDisplayNameFromSnapshot(
  snap: { nameRo?: string; nameRu?: string; nameEn?: string; name?: string },
  locale: Locale,
): string {
  const legacy = snap.name?.trim();
  return notebookProductDisplayName(
    {
      nameRo: snap.nameRo?.trim() || legacy || "—",
      nameRu: snap.nameRu?.trim() || legacy || "—",
      nameEn: snap.nameEn?.trim() || legacy || "—",
    },
    locale,
  );
}
