"use client";

/**
 * T-shirt designer orders: each printed side as the client saw it (the Roly
 * photo with the design on it, saved when the order was sent) — next to the
 * print files, so the workshop sees where and how big it goes.
 */
type Side = { placement: string; mockupKey?: string | null };

const ORDER = ["front", "back", "sleeve_left", "sleeve_right"];

export function tshirtClientViews(designerData: unknown): { placement: string; key: string }[] {
  const d = designerData as { tool?: string; sides?: Side[] } | null;
  if (!d || d.tool !== "tshirt" || !Array.isArray(d.sides)) return [];
  return d.sides
    .filter((s): s is Side & { mockupKey: string } => typeof s?.mockupKey === "string" && s.mockupKey.length > 0)
    .map((s) => ({ placement: s.placement, key: s.mockupKey }))
    .sort((a, b) => ORDER.indexOf(a.placement) - ORDER.indexOf(b.placement));
}

export function TshirtClientViews({
  designerData,
  title,
  sideName,
}: {
  designerData: unknown;
  /** «Cum a văzut clientul» */
  title: string;
  sideName: (placement: string) => string;
}) {
  const views = tshirtClientViews(designerData);
  if (views.length === 0) return null;
  return (
    <div className="mb-2" data-tshirt-client-views>
      <div className="mb-1 text-[11px] font-medium text-gray-600">{title}</div>
      <div className="flex flex-wrap gap-1.5">
        {views.map((v) => {
          const src = `/api/tshirt-mockup?key=${encodeURIComponent(v.key)}`;
          return (
            <a
              key={v.key}
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              title={sideName(v.placement)}
              className="group flex w-16 flex-col items-center gap-0.5"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={sideName(v.placement)}
                loading="lazy"
                className="h-16 w-16 rounded-md border border-gray-200 bg-white object-contain group-hover:border-gray-400"
              />
              <span className="text-[10px] text-gray-500">{sideName(v.placement)}</span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
