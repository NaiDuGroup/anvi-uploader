/**
 * Accepted payment marks (Paynet compliance: footer + checkout). Files live in
 * `public/payments/` under stable names, so the owner can swap them for the
 * official artwork. White chips keep the brand colours readable on any theme.
 * No hooks — safe in server and client components.
 */
const LOGOS = [
  { src: "/payments/visa.svg", alt: "Visa", width: 1000, height: 325, cls: "h-[15px]" },
  { src: "/payments/mastercard.svg", alt: "Mastercard", width: 999, height: 618, cls: "h-5" },
  { src: "/payments/paynet.svg", alt: "Paynet", width: 242, height: 70, cls: "h-[19px]" },
] as const;

export function PaymentLogos({ className = "" }: { className?: string }) {
  return (
    <ul className={`m-0 flex list-none flex-wrap items-center gap-2 p-0 ${className}`}>
      {LOGOS.map((l) => (
        <li key={l.src} className="flex h-8 items-center rounded-md border border-(--line) bg-white px-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- static SVG mark */}
          <img src={l.src} alt={l.alt} width={l.width} height={l.height} className={`${l.cls} w-auto`} />
        </li>
      ))}
    </ul>
  );
}
