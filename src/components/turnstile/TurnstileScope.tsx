import { turnstileConfig, type TurnstileAction } from "@/lib/turnstile/config";
import type { TurnstileLang } from "@/lib/turnstile/texts";
import { TurnstileWidget } from "./TurnstileWidget";

/**
 * Server wrapper: renders the invisible Turnstile widget (and so loads the
 * Cloudflare script) only when the keys are set — and, for the walk-in
 * uploader, only with `TURNSTILE_PROTECT_UPLOADER=1`. The public site key is
 * read from the server env here, so no `NEXT_PUBLIC_*` variable is needed.
 */
export function TurnstileScope({ action, lang }: { action: TurnstileAction; lang?: TurnstileLang }) {
  const cfg = turnstileConfig();
  if (!cfg.siteKey) return null;
  if (action === "upload" && !cfg.protectUploader) return null;
  return <TurnstileWidget siteKey={cfg.siteKey} action={action} lang={lang} />;
}
