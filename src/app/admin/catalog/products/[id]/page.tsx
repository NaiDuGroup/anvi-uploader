import { getSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import ProductFormPage from "../../_components/ProductFormPage";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (user.role !== "admin") redirect("/admin");

  const { id } = await params;
  return <ProductFormPage productId={id} />;
}
