import { ro } from "./ro";
import { ru } from "./ru";
import { en } from "./en";
import type { Locale, TranslationDictionary } from "./types";

export type { Locale, TranslationDictionary };
export { LOCALES, LOCALE_LABELS, LOCALE_FLAGS, DEFAULT_LOCALE } from "./types";

const dictionaries: Record<Locale, TranslationDictionary> = { ro, ru, en };

export function getDictionary(locale: Locale): TranslationDictionary {
  return dictionaries[locale];
}
