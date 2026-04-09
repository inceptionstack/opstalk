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
    const tokens = span.text.split(/(\s+)/);
    for (const token of tokens) {
      const tokenWidth = stringWidth(token);
      if (tokenWidth === 0) {
        continue;
      }
      if (width > 0 && width + tokenWidth > maxWidth) {
        pushCurrent();
      }
      if (tokenWidth > maxWidth) {
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
