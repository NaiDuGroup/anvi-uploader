"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "./button";

/**
 * Navigation button that owns its own loading state via React's
 * `useTransition`. Wraps Next.js `<Link>` so prefetching keeps working,
 * but intercepts the click to push through `useTransition` — the
 * `pending` flag stays true until the new RSC payload finishes
 * streaming, which gives us an immediate spinner on slow routes like
 * `/admin/orders/new` and prevents users from double-clicking the
 * trigger before the transition lands.
 */
interface NavLinkButtonProps
  extends Omit<ButtonProps, "asChild" | "children" | "onClick"> {
  href: string;
  prefetch?: boolean;
  replace?: boolean;
  /** Icon rendered to the left of the label when the button is idle. */
  leadingIcon?: ReactNode;
  children: ReactNode;
}

export function NavLinkButton({
  href,
  prefetch,
  replace,
  leadingIcon,
  children,
  disabled,
  className,
  ...rest
}: NavLinkButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      asChild
      disabled={pending || disabled}
      className={className}
      {...rest}
    >
      <Link
        href={href}
        prefetch={prefetch}
        onClick={(e) => {
          e.preventDefault();
          if (pending) return;
          startTransition(() => {
            if (replace) router.replace(href);
            else router.push(href);
          });
        }}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          leadingIcon
        )}
        {children}
      </Link>
    </Button>
  );
}
