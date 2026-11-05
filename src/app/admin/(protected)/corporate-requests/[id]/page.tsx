import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { getCorporateRequest, listCorporateAssignees } from "@/lib/corporate/requests";
import CorporateRequestDetailClient from "./CorporateRequestDetailClient";

export const dynamic = "force-dynamic";

/** One «Pentru companii» request: contact, request, files, status / assignee / notes. */
export default async function AdminCorporateRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!isAdmin(user.role)) redirect("/admin/orders");
  const { id } = await params;
  const [request, assignees] = await Promise.all([getCorporateRequest(id), listCorporateAssignees()]);
  if (!request) notFound();
  return <CorporateRequestDetailClient request={request} assignees={assignees} />;
}
