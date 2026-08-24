/**
 * DOM-free text-box height estimate so the editor can grow a block when the
 * designer types or changes the type size. Soft-wrap uses an average glyph
 * width; the canvas renderer still does the precise wrap at paint time.
 */

export interface TextBoxMetrics {
  text: string;
  width: number;
  fontSizePx: number;
  lineHeight: number;
  letterSpacingPx: number;
}

export function estimateWrappedLineCount(
  text: string,
  width: number,
  fontSizePx: number,
  letterSpacingPx: number,
): number {
  const avgChar = Math.max(4, fontSizePx * 0.55 + letterSpacingPx);
  const charsPerLine = Math.max(1, Math.floor(width / avgChar));
  const paragraphs = text.split("\n");
  if (paragraphs.length === 0) return 1;
  let lines = 0;
  for (const paragraph of paragraphs) {
    const len = paragraph.length === 0 ? 1 : paragraph.length;
    lines += Math.max(1, Math.ceil(len / charsPerLine));
  }
  return Math.max(1, lines);
}

export function estimateTextBoxHeight(metrics: TextBoxMetrics): number {
  const linePx = Math.max(1, metrics.fontSizePx * metrics.lineHeight);
  const lines = estimateWrappedLineCount(
    metrics.text,
    metrics.width,
    metrics.fontSizePx,
    metrics.letterSpacingPx,
  );
  return Math.round(Math.max(linePx, lines * linePx));
}
