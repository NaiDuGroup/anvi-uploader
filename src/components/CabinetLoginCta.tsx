"use client";

import Link from "next/link";
import { LogIn } from "lucide-react";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { useCabinetSession } from "@/hooks/useCabinetSession";

/**
 * Standalone "Войти в личный кабинет" button placed at the bottom of public
 * landing pages (`/`, `/mug`, `/notebook`). Visible only to anonymous
 * visitors — when a customer is already signed in, {@link CabinetHeaderBadge}
 * shows their pill in the top-right corner and we don't repeat the link
 * down here.
 *
 * Superadmins can hide this block via Settings → Public site (stored on
 * {@link CompanyProfile.showPublicCabinetLoginCta}); pass `enabled={false}`
 * when that flag is off.
 *
 * Renders nothing while the session is still loading so we never flash the
 * CTA for users that turn out to be authenticated.
 */
export default function CabinetLoginCta({
  className,
  enabled = true,
}: {
  className?: string;
  /** When false (superadmin setting), the CTA is not rendered. */
  enabled?: boolean;
}) {
  const { t } = useLanguageStore();
  const session = useCabinetSession();

  if (!enabled) return null;
  if (session.status !== "anonymous") return null;

  return (
    <Link
      href="/cabinet/login"
      className={
        "mx-auto mt-4 inline-flex w-full max-w-lg items-center justify-center gap-2 rounded-2xl border border-gold/30 bg-white px-5 py-3 text-sm font-semibold text-gold shadow-sm transition-colors hover:bg-gold/5 " +
        (className ?? "")
      }
    >
      <LogIn className="h-4 w-4" />
      {t.cabinetAuth.publicCtaButton}
    </Link>
  );
}
