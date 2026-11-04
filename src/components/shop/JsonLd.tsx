import { jsonLdScript, type JsonLd as JsonLdData } from "@/lib/storefront/shopSeo";

/** Structured data (schema.org JSON-LD) for search engines. */
export function JsonLd({ data }: { data: JsonLdData | JsonLdData[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(data) }} />;
}
