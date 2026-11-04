import type { Metadata } from "next";
import { ShopNotFound, shopNotFoundTitle } from "@/components/shop/ShopNotFound";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await shopNotFoundTitle() };
}

/** `notFound()` anywhere in the storefront (unknown category, product, deep path). */
export default function ShopNotFoundPage() {
  return <ShopNotFound />;
}
