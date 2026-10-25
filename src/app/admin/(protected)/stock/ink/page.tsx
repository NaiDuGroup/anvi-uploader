import { redirect } from "next/navigation";

/** Legacy «Чернила» page: ink is now kept per printer on «Принтеры». */
export default function InkStockPage() {
  redirect("/admin/stock/printers");
}
