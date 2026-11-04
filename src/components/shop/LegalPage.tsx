import { Fragment } from "react";
import { parseLegalMarkdown, type LegalBlock, type LegalInline } from "@/lib/storefront/legalMarkdown";
import { SHOP_LEGAL_TEXTS, type ShopLegalDoc } from "@/lib/storefront/legalTexts.generated";
import { shopT, type ShopLang, type ShopStringKey } from "@/lib/storefront/i18n";

export const LEGAL_TITLE: Record<ShopLegalDoc, ShopStringKey> = {
  termeni: "termsTitle",
  retur: "returnsTitle",
  confidentialitate: "privacyTitle",
};

function Inline({ parts }: { parts: LegalInline[] }) {
  return (
    <>
      {parts.map((p, i) => {
        switch (p.kind) {
          case "text":
            return <Fragment key={i}>{p.text}</Fragment>;
          case "bold":
            return (
              <strong key={i}>
                <Inline parts={p.children} />
              </strong>
            );
          case "italic":
            return (
              <em key={i}>
                <Inline parts={p.children} />
              </em>
            );
          case "link":
            return (
              <a key={i} href={p.href} rel="noopener noreferrer">
                {p.text}
              </a>
            );
        }
      })}
    </>
  );
}

function Block({ block }: { block: LegalBlock }) {
  switch (block.kind) {
    case "heading":
      // The page title is the h1; the document's own headings start one level down.
      return block.level === 1 ? null : block.level === 2 ? (
        <h2 className="m-0 mt-4 text-xl font-extrabold">
          <Inline parts={block.text} />
        </h2>
      ) : (
        <h3 className="m-0 mt-2 text-lg font-bold">
          <Inline parts={block.text} />
        </h3>
      );
    case "para":
      return (
        <p className="m-0 leading-relaxed">
          <Inline parts={block.text} />
        </p>
      );
    case "quote":
      return (
        <blockquote className="m-0 border-l-4 border-(--line2) pl-4 text-(--muted)">
          <Inline parts={block.text} />
        </blockquote>
      );
    case "rule":
      return <hr className="my-2 border-(--line)" />;
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag className={`m-0 flex flex-col gap-1.5 pl-6 leading-relaxed ${block.ordered ? "list-decimal" : "list-disc"}`}>
          {block.items.map((it, i) => (
            <li key={i}>
              <Inline parts={it} />
            </li>
          ))}
        </Tag>
      );
    }
    case "table":
      return (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {block.head.map((c, i) => (
                  <th key={i} className="border-b border-(--line2) px-2 py-1.5 text-left font-bold">
                    <Inline parts={c} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j} className="border-b border-(--line) px-2 py-1.5 align-top">
                      <Inline parts={c} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

/** /termeni, /retur, /confidentialitate: the draft text (marked as not yet approved), or a placeholder. */
export function LegalPage({ doc, lang }: { doc: ShopLegalDoc; lang: ShopLang }) {
  const t = shopT(lang);
  const md: string | null = SHOP_LEGAL_TEXTS[doc]?.[lang] ?? null;
  const blocks: LegalBlock[] = md ? parseLegalMarkdown(md) : [];
  return (
    <main className="mx-auto flex max-w-[860px] flex-col gap-4 px-4 pt-6 pb-12 sm:px-6 sm:pt-10">
      <p
        role="note"
        className="m-0 rounded-xl border-2 border-dashed border-(--warn) bg-(--warn-soft) px-4 py-3 font-extrabold text-(--warn)"
      >
        {t("legalDraft")}
        <span className="block text-sm font-semibold">{t("legalDraftNote")}</span>
      </p>
      <h1 className="m-0 text-[28px] leading-tight font-extrabold sm:text-4xl">{t(LEGAL_TITLE[doc])}</h1>
      <div className="flex flex-col gap-3 text-base text-(--ink)">
        {blocks.map((b, i) => (
          <Block key={i} block={b} />
        ))}
      </div>
    </main>
  );
}
