import { redirect } from "next/navigation";
import { PrintMethodCode, printMethodPagePath } from "@/lib/printMethods/methods";

/** Old address of «DTF: прайс и нормы». */
export default function DtfStockPage() {
  redirect(printMethodPagePath(PrintMethodCode.Dtf));
}
