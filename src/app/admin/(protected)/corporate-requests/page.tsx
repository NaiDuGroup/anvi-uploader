import { redirect } from "next/navigation";

/** Old «Заявки компаний» URL: the list now lives in «Сайт» (super admin only). Keeps filters. */
export default async function LegacyCorporateRequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    for (const one of Array.isArray(v) ? v : v === undefined ? [] : [v]) qs.append(k, one);
  }
  const q = qs.toString();
  redirect(q ? `/admin/shop/corporate-requests?${q}` : "/admin/shop/corporate-requests");
}
