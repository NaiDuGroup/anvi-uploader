/**
 * The small Markdown subset the legal drafts use (`docs/legal/*.md`):
 * `#`–`###` headings, paragraphs, `-` / `1.` lists, `>` quotes, `---` rules,
 * pipe tables and inline `**bold**`, `*italic*`, `[text](url)`. No HTML is
 * ever passed through — the page renders these blocks as React elements.
 * Pure (unit-tested).
 */

export type LegalInline =
  | { kind: "text"; text: string }
  | { kind: "bold"; children: LegalInline[] }
  | { kind: "italic"; children: LegalInline[] }
  | { kind: "link"; href: string; text: string };

export type LegalBlock =
  | { kind: "heading"; level: 1 | 2 | 3; text: LegalInline[] }
  | { kind: "para"; text: LegalInline[] }
  | { kind: "list"; ordered: boolean; items: LegalInline[][] }
  | { kind: "quote"; text: LegalInline[] }
  | { kind: "rule" }
  | { kind: "table"; head: LegalInline[][]; rows: LegalInline[][][] };

/** Only http(s), mailto and tel links (anything else becomes plain text). */
function safeHref(href: string): string | null {
  return /^(https?:\/\/|mailto:|tel:)/i.test(href.trim()) ? href.trim() : null;
}

export function parseInline(src: string): LegalInline[] {
  const out: LegalInline[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push({ kind: "text", text: buf });
    buf = "";
  };
  let i = 0;
  while (i < src.length) {
    if (src.startsWith("**", i)) {
      const end = src.indexOf("**", i + 2);
      if (end > i + 2) {
        flush();
        out.push({ kind: "bold", children: parseInline(src.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    if (src[i] === "*" && src[i + 1] !== " ") {
      const end = src.indexOf("*", i + 1);
      if (end > i + 1) {
        flush();
        out.push({ kind: "italic", children: parseInline(src.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }
    if (src[i] === "[") {
      const m = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(src.slice(i));
      const href = m ? safeHref(m[2]!) : null;
      if (m && href) {
        flush();
        out.push({ kind: "link", href, text: m[1]! });
        i += m[0].length;
        continue;
      }
    }
    buf += src[i];
    i++;
  }
  flush();
  return out;
}

function tableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

export function parseLegalMarkdown(md: string): LegalBlock[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: LegalBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (!trimmed) {
      i++;
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (h) {
      blocks.push({ kind: "heading", level: h[1]!.length as 1 | 2 | 3, text: parseInline(h[2]!) });
      i++;
      continue;
    }
    if (/^-{3,}$/.test(trimmed)) {
      blocks.push({ kind: "rule" });
      i++;
      continue;
    }
    if (trimmed.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.trim().startsWith("|")) {
        rows.push(tableCells(lines[i]!));
        i++;
      }
      const body = rows.filter((r, idx) => !(idx === 1 && r.every((c) => /^:?-{2,}:?$/.test(c))));
      blocks.push({
        kind: "table",
        head: (body[0] ?? []).map(parseInline),
        rows: body.slice(1).map((r) => r.map(parseInline)),
      });
      continue;
    }
    if (trimmed.startsWith(">")) {
      const parts: string[] = [];
      while (i < lines.length && lines[i]!.trim().startsWith(">")) {
        parts.push(lines[i]!.trim().replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ kind: "quote", text: parseInline(parts.join(" ")) });
      continue;
    }
    const bullet = /^[-*•]\s+/;
    const numbered = /^\d+[.)]\s+/;
    if (bullet.test(trimmed) || numbered.test(trimmed)) {
      const ordered = numbered.test(trimmed);
      const re = ordered ? numbered : bullet;
      const items: string[] = [];
      while (i < lines.length) {
        const l = lines[i]!.trim();
        if (re.test(l)) {
          items.push(l.replace(re, ""));
        } else if (l && !/^(#{1,3}\s|\||>|-{3,}$)/.test(l) && !bullet.test(l) && !numbered.test(l) && items.length) {
          // Continuation line of the previous item.
          items[items.length - 1] += ` ${l}`;
        } else {
          break;
        }
        i++;
      }
      blocks.push({ kind: "list", ordered, items: items.map(parseInline) });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length) {
      const l = lines[i]!.trim();
      if (!l || /^(#{1,3}\s|\||>|-{3,}$)/.test(l) || bullet.test(l) || numbered.test(l)) break;
      para.push(l);
      i++;
    }
    blocks.push({ kind: "para", text: parseInline(para.join(" ")) });
  }
  return blocks;
}
