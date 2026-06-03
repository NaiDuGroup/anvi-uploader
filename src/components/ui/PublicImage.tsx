"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { cn } from "@/lib/utils";

/**
 * Tracks which toast has already been shown in this page session so the
 * user never receives the same image-error toast twice (e.g. when many
 * thumbnails fail at once).
 */
const shownToasts = new Set<string>();

interface PublicImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  fallback?: React.ReactNode;
  /** When true a toast is shown the first time this URL fails to load. Defaults to true. */
  showToast?: boolean;
}

/**
 * Drop-in replacement for `<img>` that streams from `/api/public/file` (or a
 * CDN URL). On load failure it shows a styled placeholder and — once per
 * unique URL per page session — a sonner toast so the user understands what
 * happened.
 */
export function PublicImage({
  src,
  alt,
  className,
  fallback,
  showToast = true,
  ...rest
}: PublicImageProps) {
  const [failed, setFailed] = useState(false);
  const toastShownRef = useRef(false);
  const t = useLanguageStore((s) => s.t);

  const handleError = useCallback(() => {
    setFailed(true);

    if (showToast && !toastShownRef.current && !shownToasts.has(src)) {
      toastShownRef.current = true;
      shownToasts.add(src);
      toast.warning(t.common.imageLoadError, {
        id: `img-error-${src}`,
        description: src.includes("/api/public/file") ? src.split("key=")[1]?.split("&")[0] : undefined,
      });
    }
  }, [src, showToast, t]);

  if (failed) {
    return (
      fallback ?? (
        <span
          aria-hidden
          className={cn(
            "flex items-center justify-center bg-gray-100 text-gray-300",
            className,
          )}
        >
          <BrokenImageIcon />
        </span>
      )
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- dynamic catalog / R2 CDN URLs
    <img src={src} alt={alt} className={className} onError={handleError} {...rest} />
  );
}

function BrokenImageIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}
