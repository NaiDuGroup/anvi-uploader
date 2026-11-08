import type { Locale } from "../types";
import { apiErrorsEn } from "./en";
import { apiErrorsRo } from "./ro";
import { apiErrorsRu } from "./ru";
import type { ApiErrorsDictionary } from "./types";

export type { ApiErrorsDictionary };

const DICTS: Record<Locale, ApiErrorsDictionary> = { ro: apiErrorsRo, ru: apiErrorsRu, en: apiErrorsEn };

export function apiErrorsDict(locale: Locale): ApiErrorsDictionary {
  return DICTS[locale] ?? apiErrorsRo;
}
