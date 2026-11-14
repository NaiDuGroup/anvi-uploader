import { loadTshirtCatalog, loadTshirtSleeve } from "@/lib/tshirt/tshirtOrder";
import TshirtPageClient from "./TshirtPageClient";

export const dynamic = "force-dynamic";

/**
 * Public t-shirt designer: text / images on the front, back and sleeves, live
 * preview, DTF order. The catalog comes with the page (the shirt photo shows
 * at once); the client falls back to `/api/tshirt/catalog` when it failed here.
 */
export default async function TshirtPage() {
  const initial = await Promise.all([loadTshirtCatalog(), loadTshirtSleeve()])
    .then(([garments, sleeve]) => ({ garments, sleeve }))
    .catch((e: unknown) => {
      console.error("tshirt page catalog", e);
      return null;
    });
  return <TshirtPageClient initial={initial} />;
}
