import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { isCorporateStatus, type CorporateStatus } from "@/lib/corporate/requestRules";
import { listCorporateAssignees, listCorporateRequests } from "@/lib/corporate/requests";
import CorporateRequestsPageClient from "./CorporateRequestsPageClient";

export const dynamic = "force-dynamic";

interface SearchParams {
  status?: string;
  q?: string;
  assignee?: string;
  page?: string;
}

/** «Заявки компаний»: storefront «Pentru companii» quote requests (staff). */
export default async function AdminCorporateRequestsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!isAdmin(user.role)) redirect("/admin/orders");

  const sp = await searchParams;
  // Default view: open requests (new / in work / offer sent).
  const status: CorporateStatus | "open" | null =
    sp.status === "all" ? null : isCorporateStatus(sp.status) ? sp.status : "open";
  const filters = { status, q: sp.q ?? "", assigneeId: sp.assignee ?? "", page: Number(sp.page) || 1 };
  let data: Awaited<ReturnType<typeof listCorporateRequests>> | null = null;
  let assignees: { id: string; name: string }[] = [];
  try {
    [data, assignees] = await Promise.all([listCorporateRequests(filters), listCorporateAssignees()]);
  } catch (error) {
    console.error("[admin] corporate requests failed:", error);
  }
  return (
    <CorporateRequestsPageClient
      data={data}
      assignees={assignees}
      filters={{ status: status ?? "all", q: filters.q, assignee: filters.assigneeId }}
    />
  );
}
