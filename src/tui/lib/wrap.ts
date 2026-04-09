import stringWidth from './width.js';
import type { RenderSpan } from './types.js';

export function wrapSpans(spans: RenderSpan[], maxWidth: number): RenderSpan[][] {
  if (maxWidth <= 0) {
    return [spans];
  }

  const rows: RenderSpan[][] = [];
  let current: RenderSpan[] = [];
  let width = 0;

  const pushCurrent = (): void => {
    rows.push(current.length > 0 ? current : [{ text: '' }]);
    current = [];
    width = 0;
  };

  for (const span of spans) {
    // Split into words and whitespace, preserving whitespace tokens
    const tokens = span.text.split(/(\s+)/);
    for (const token of tokens) {
      if (token.length === 0) continue;

      const tokenWidth = stringWidth(token);
      const isWhitespace = /^\s+$/.test(token);

      // Whitespace at start of a new line after wrap: skip it
      if (isWhitespace && width === 0 && rows.length > 0) continue;

      // Word would exceed line: wrap first
      if (!isWhitespace && width > 0 && width + tokenWidth > maxWidth) {
        pushCurrent();
      }

      // Long word that exceeds maxWidth by itself: break by character
      if (!isWhitespace && tokenWidth > maxWidth) {
        for (const char of [...token]) {
          const charWidth = stringWidth(char);
          if (width > 0 && width + charWidth > maxWidth) {
            pushCurrent();
          }
          current.push({ ...span, text: char });
          width += charWidth;
        }
        continue;
      }

      current.push({ ...span, text: token });
      width += tokenWidth;
    }
  }

  pushCurrent();
  return rows;
}
