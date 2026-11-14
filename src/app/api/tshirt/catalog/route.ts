import { NextResponse } from "next/server";
import { loadTshirtCatalog, loadTshirtSleeve } from "@/lib/tshirt/tshirtOrder";
import { TSHIRT_DPI_MIN, TSHIRT_DPI_WARN, TSHIRT_PRINT_AREA, TSHIRT_PRINT_DPI } from "@/lib/tshirt/tshirtRules";

export const dynamic = "force-dynamic";

/** Public: t-shirts (colours, sizes, stock) + print rules for the /tshirt designer. */
export async function GET() {
  try {
    const [garments, sleeve] = await Promise.all([loadTshirtCatalog(), loadTshirtSleeve()]);
    return NextResponse.json({
      garments,
      printArea: TSHIRT_PRINT_AREA,
      sleeve,
      dpi: { print: TSHIRT_PRINT_DPI, warn: TSHIRT_DPI_WARN, min: TSHIRT_DPI_MIN },
    });
  } catch (e) {
    console.error("GET /api/tshirt/catalog", e);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}
