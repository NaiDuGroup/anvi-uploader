/**
 * Host routing for the storefront domain (edge-safe: no Node APIs).
 *
 * The same deployment serves two kinds of host:
 * - shop hosts (`SHOP_HOSTS`, default `anvi.md,www.anvi.md`): the storefront
 *   at the root (`/cani` is served by `/shop/cani`), staff / uploader pages
 *   redirect to print.anvi.md, `www.` redirects to the bare domain;
 * - every other host (print.anvi.md, previews, localhost): unchanged, the
 *   storefront stays under `/shop`.
 */

type Env = Readonly<Record<string, string | undefined>>;

export const DEFAULT_SHOP_HOSTS = "anvi.md,www.anvi.md";

/** Staff, cabinet and uploader pages: they live on print.anvi.md only. */
export const PRINT_ORIGIN = "https://print.anvi.md";

/**
 * First path segments that belong to print.anvi.md (admin, client cabinet,
 * walk-in uploader product pages, approval / tracking links).
 */
export const PRINT_ONLY_SEGMENTS: ReadonlySet<string> = new Set([
  "admin",
  "cabinet",
  "approve",
  "track",
  "mug",
  "notebook",
  "pen",
]);

/** Lower-case host without the port. */
export function normalizeHost(host: string | null | undefined): string {
  return (host ?? "").trim().toLowerCase().replace(/:\d+$/, "");
}

export function parseShopHosts(env: Env = process.env): string[] {
  const raw = env.SHOP_HOSTS?.trim() ? env.SHOP_HOSTS : DEFAULT_SHOP_HOSTS;
  return raw
    .split(",")
    .map((h) => normalizeHost(h))
    .filter(Boolean);
}

export function isShopHost(host: string | null | undefined, env: Env = process.env): boolean {
  const h = normalizeHost(host);
  return h !== "" && parseShopHosts(env).includes(h);
}

/** The canonical shop host: the first configured one that is not `www.` (anvi.md). */
export function primaryShopHost(env: Env = process.env): string {
  const hosts = parseShopHosts(env);
  return hosts.find((h) => !h.startsWith("www.")) ?? hosts[0] ?? "anvi.md";
}

/** Canonical storefront origin, e.g. `https://anvi.md`. */
export function shopOrigin(env: Env = process.env): string {
  return `https://${primaryShopHost(env)}`;
}

/** Closed test: noindex + test banner, until `SHOP_LAUNCHED=1`. */
export function isShopLaunched(env: Env = process.env): boolean {
  return env.SHOP_LAUNCHED?.trim() === "1";
}

/** Base prefix of storefront links on a host: "" on a shop host, "/shop" elsewhere. */
export function shopBaseForHost(host: string | null | undefined, env: Env = process.env): "" | "/shop" {
  return isShopHost(host, env) ? "" : "/shop";
}

/**
 * A storefront link for a base. `path` is written the storefront way
 * (`/shop`, `/shop/cos`, `/shop#catalog`); on a shop host the `/shop` prefix
 * is dropped (`/`, `/cos`, `/#catalog`).
 */
export function shopHref(base: "" | "/shop", path: string): string {
  if (base === "/shop") return path;
  if (path === "/shop") return "/";
  if (path.startsWith("/shop/")) return path.slice(5);
  if (path.startsWith("/shop#") || path.startsWith("/shop?")) return `/${path.slice(5)}`;
  return path;
}

/** Storefront-relative pathname (`/shop/cos` and `/cos` → `/cos`; `/shop` → `/`). */
export function shopRelPath(pathname: string): string {
  if (pathname === "/shop") return "/";
  if (pathname.startsWith("/shop/")) return pathname.slice(5);
  return pathname || "/";
}

/** Request header (set by the middleware on shop hosts) with the clean storefront path, for the canonical URL. */
export const SHOP_PATH_HEADER = "x-shop-path";

export const SHOP_ROBOTS_TXT = "User-agent: *\nDisallow: /\n";

export type ShopRoute =
  | { kind: "pass" }
  | { kind: "redirect"; location: string; status: 301 | 302 | 307 | 308 }
  | { kind: "robots" }
  | { kind: "rewrite"; pathname: string }
  | { kind: "next" };

/** Paths a shop host serves as-is (API, Next assets, public files). */
function isPassThroughPath(pathname: string): boolean {
  if (pathname === "/api" || pathname.startsWith("/api/")) return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname.startsWith("/favicon") || pathname === "/sitemap.xml") return true;
  // Files from /public (logo.png, icon-192.png, fonts/*.woff2, *.glb, …).
  const last = pathname.slice(pathname.lastIndexOf("/") + 1);
  return last.includes(".");
}

/**
 * What a shop-host request should do. Only called for shop hosts; other
 * hosts never reach it. `search` includes the leading `?` (or is "").
 */
export function routeShopRequest(
  host: string,
  pathname: string,
  search: string,
  env: Env = process.env,
): ShopRoute {
  const h = normalizeHost(host);
  const primary = primaryShopHost(env);
  if (h !== primary && h === `www.${primary}`) {
    return { kind: "redirect", location: `https://${primary}${pathname}${search}`, status: 308 };
  }
  if (pathname === "/robots.txt") return isShopLaunched(env) ? { kind: "pass" } : { kind: "robots" };
  if (isPassThroughPath(pathname)) return { kind: "pass" };

  const first = pathname.split("/")[1] ?? "";
  if (PRINT_ONLY_SEGMENTS.has(first)) {
    return { kind: "redirect", location: `${PRINT_ORIGIN}${pathname}${search}`, status: 307 };
  }
  if (first === "shop") return { kind: "next" };
  return { kind: "rewrite", pathname: pathname === "/" ? "/shop" : `/shop${pathname}` };
}
