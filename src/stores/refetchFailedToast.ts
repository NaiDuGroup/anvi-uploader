import { toast } from "sonner";
import { useLanguageStore } from "@/stores/useLanguageStore";

const TEXT = {
  ru: "Не удалось обновить список",
  ro: "Lista nu a putut fi actualizată",
  en: "Could not refresh the list",
} as const;

/**
 * One toast when a store refetch after a filter change fails (background GETs
 * are not covered by the global error toasts). The fixed id dedupes repeats.
 */
export function showRefetchFailedToast(): void {
  const locale = useLanguageStore.getState().locale;
  toast.error(TEXT[locale] ?? TEXT.ru, { id: "refetch-failed" });
}
