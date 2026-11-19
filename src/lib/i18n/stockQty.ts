import { formatQuantity } from "@/lib/stock/unified/quantity";

/** Stock units shown after quantities (`StockCategory.unit`). */
export type StockQtyUnit = "pcs" | "m" | "ml" | "g" | "sheet";

/** Russian plural of a whole count; fractions take the «few» form (2,5 листа). */
function ruForm(n: number, one: string, few: string, many: string): string {
  if (!Number.isInteger(n)) return few;
  const a = Math.abs(n);
  const mod10 = a % 10;
  const mod100 = a % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

const RU_UNITS: Record<Exclude<StockQtyUnit, "sheet">, string> = { pcs: "шт", m: "м", ml: "мл", g: "г" };
const RO_UNITS: Record<Exclude<StockQtyUnit, "sheet">, string> = { pcs: "buc", m: "m", ml: "ml", g: "g" };
const EN_UNITS: Record<Exclude<StockQtyUnit, "sheet">, string> = { pcs: "pcs", m: "m", ml: "ml", g: "g" };

/** «5 листов», «2 листа», «1 лист»; other units: «3 м». Keeps the sign of `qty`. */
export function ruStockQty(qty: number, unit: StockQtyUnit): string {
  const q: string = formatQuantity(qty);
  if (unit === "sheet") return `${q} ${ruForm(Number(q), "лист", "листа", "листов")}`;
  return `${q} ${RU_UNITS[unit] ?? unit}`;
}

/** «1 coală», «2 coli», «20 de coli»; other units: «3 m». */
export function roStockQty(qty: number, unit: StockQtyUnit): string {
  const q: string = formatQuantity(qty);
  if (unit === "sheet") {
    const n: number = Number(q);
    if (Math.abs(n) === 1) return `${q} coală`;
    const a: number = Math.abs(n);
    const de: boolean = Number.isInteger(a) && a !== 0 && (a % 100 === 0 || a % 100 >= 20);
    return de ? `${q} de coli` : `${q} coli`;
  }
  return `${q} ${RO_UNITS[unit] ?? unit}`;
}

/** «1 sheet», «2 sheets»; other units: «3 m». */
export function enStockQty(qty: number, unit: StockQtyUnit): string {
  const q: string = formatQuantity(qty);
  if (unit === "sheet") return `${q} ${Math.abs(Number(q)) === 1 ? "sheet" : "sheets"}`;
  return `${q} ${EN_UNITS[unit] ?? unit}`;
}
