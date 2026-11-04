/**
 * Catalog photo in a fixed-ratio box (no layout shift). Plain `<img>`: the
 * photos come from `/api/public/file` / the catalog CDN at their own size.
 */
export function ShopImg({
  src,
  alt,
  className = "",
  fit = "cover",
  eager = false,
}: {
  src: string | null;
  alt: string;
  className?: string;
  fit?: "cover" | "contain";
  eager?: boolean;
}) {
  if (!src) {
    return <div aria-hidden className={`bg-(--soft) ${className}`} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- catalog photos are served pre-sized by our file route
    <img
      src={src}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      className={`bg-(--soft) text-transparent ${fit === "cover" ? "object-cover" : "object-contain"} ${className}`}
    />
  );
}
