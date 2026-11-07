import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApparelDemo3D } from "@/components/shop/studio/apparelDemo/ApparelDemo3D";
import { EDITOR_FONT_VARIABLE_CLASSES } from "@/lib/editor/editorNextFonts";
import { studioApparelAllowed } from "@/lib/studio/flagServer";
import { SHOP_PRIVATE_ROBOTS } from "@/lib/storefront/shopSeo";

export const metadata: Metadata = { title: "Apparel visual prototype", robots: SHOP_PRIVATE_ROBOTS };

/** Prototype of the apparel visuals (photo mockup + 3D), behind the apparel Studio gate. */
export default async function ApparelDemoPage() {
  if (!(await studioApparelAllowed())) notFound();
  return (
    <main data-studio-fonts className={EDITOR_FONT_VARIABLE_CLASSES.join(" ")}>
      <ApparelDemo3D />
    </main>
  );
}
