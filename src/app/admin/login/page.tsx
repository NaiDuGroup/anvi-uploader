import { getSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import LoginPageClient from "./_components/LoginPageClient";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/admin");
  return <LoginPageClient />;
}
