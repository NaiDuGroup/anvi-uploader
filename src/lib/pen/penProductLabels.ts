import type { Locale } from "@/lib/i18n";

export function penProductDisplayName(
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

/** Resolves trilingual names from order snapshot JSON. */
export function penProductDisplayNameFromSnapshot(
  snap: { nameRo?: string; nameRu?: string; nameEn?: string },
  locale: Locale,
): string {
  return penProductDisplayName(
    {
      nameRo: snap.nameRo?.trim() || "—",
      nameRu: snap.nameRu?.trim() || "—",
      nameEn: snap.nameEn?.trim() || "—",
    },
    locale,
  );
}
