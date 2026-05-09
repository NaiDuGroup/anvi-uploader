import type { Locale } from "@/lib/i18n";

export function mugProductDisplayName(
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

/** Resolves trilingual names from order snapshot JSON (optional fields + legacy `name`). */
export function mugProductDisplayNameFromSnapshot(
  snap: { nameRo?: string; nameRu?: string; nameEn?: string; name?: string },
  locale: Locale,
): string {
  const legacy = snap.name?.trim();
  return mugProductDisplayName(
    {
      nameRo: snap.nameRo?.trim() || legacy || "—",
      nameRu: snap.nameRu?.trim() || legacy || "—",
      nameEn: snap.nameEn?.trim() || legacy || "—",
    },
    locale,
  );
}
