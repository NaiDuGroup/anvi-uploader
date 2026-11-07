import { lineQuantity, type CartLine } from "@/lib/storefront/cart";

/** The Studio «added to cart» screen (`StudioAdded`): what it shows of the line and the cart. Pure. */

/** What the «added» screen shows of a line: its pictures (front, back when printed), text, quantity, price. Pure. */
export function addedLineView(line: CartLine): {
  front: string | null;
  back: string | null;
  title: string;
  optionsText: string;
  quantity: number;
  total: number | null;
} {
  // Business cards / flyers: the back's small picture (the line image is the front as cut).
  const back: string | null = line.files.find((f) => f.zone === "back")?.thumb ?? null;
  return {
    front: line.image ?? line.files.find((f) => f.zone === "front")?.thumb ?? null,
    back,
    title: line.title,
    optionsText: line.optionsText,
    quantity: lineQuantity(line.quote),
    total: line.lastTotal ?? null,
  };
}

/** The cart after the add: lines and their total (null while any line has no known price). Pure. */
export function cartSummary(lines: readonly CartLine[]): { count: number; total: number | null } {
  let total = 0;
  for (const l of lines) {
    if (l.lastTotal == null) return { count: lines.length, total: null };
    total += l.lastTotal;
  }
  return { count: lines.length, total: Math.round(total * 100) / 100 };
}
