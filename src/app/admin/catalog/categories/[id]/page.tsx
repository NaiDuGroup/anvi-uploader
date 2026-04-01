import { getSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import CategoryFormPage from "../../_components/CategoryFormPage";

export default async function EditCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (user.role !== "admin") redirect("/admin");

  const { id } = await params;
  return <CategoryFormPage categoryId={id} />;
}
