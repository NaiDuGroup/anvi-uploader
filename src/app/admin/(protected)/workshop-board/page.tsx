import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import WorkshopBoardClient from "../../_components/WorkshopBoardClient";

export const dynamic = "force-dynamic";

export default async function WorkshopBoardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");

  // Only workshop operators and superadmins may access the board.
  const allowed = ["workshop", "superadmin"];
  if (!allowed.includes(user.role)) redirect("/admin/orders");

  return (
    <WorkshopBoardClient
      currentUser={{ id: user.id, name: user.name, role: user.role }}
    />
  );
}
