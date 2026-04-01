import { getSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import CategoryFormPage from "../../_components/CategoryFormPage";

export default async function NewCategoryPage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (user.role !== "admin") redirect("/admin");

  return <CategoryFormPage />;
}
