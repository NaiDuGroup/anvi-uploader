/** Turnstile messages (kept here, not in the big dictionaries, so the feature stays self-contained). */
export type TurnstileLang = "ro" | "ru" | "en";

const TEXTS: Record<TurnstileLang, { failed: string; retry: string }> = {
  ro: {
    failed: "Nu am putut confirma că nu ești robot. Verifică conexiunea și încearcă din nou.",
    retry: "Încearcă din nou",
  },
  ru: {
    failed: "Не удалось подтвердить, что вы не робот. Проверьте подключение и попробуйте ещё раз.",
    retry: "Повторить",
  },
  en: {
    failed: "We couldn't confirm you're not a robot. Check your connection and try again.",
    retry: "Try again",
  },
};

export function parseTurnstileLang(value: string | null | undefined): TurnstileLang | null {
  return value === "ro" || value === "ru" || value === "en" ? value : null;
}

export function turnstileText(lang: TurnstileLang | null | undefined, key: "failed" | "retry"): string {
  return TEXTS[lang ?? "ro"][key];
}
