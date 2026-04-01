import { getSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import ProductFormPage from "../../_components/ProductFormPage";

export default async function NewProductPage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (user.role !== "admin") redirect("/admin");

  return <ProductFormPage />;
}
