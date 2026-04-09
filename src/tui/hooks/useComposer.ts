import { useCallback, useMemo, useState } from 'react';
import { useInput } from 'ink';

function prevWordBoundary(text: string, cursor: number): number {
  let pos = cursor;
  while (pos > 0 && text[pos - 1] === ' ') pos -= 1;
  while (pos > 0 && text[pos - 1] !== ' ') pos -= 1;
  return pos;
}

function nextWordBoundary(text: string, cursor: number): number {
  let pos = cursor;
  while (pos < text.length && text[pos] !== ' ') pos += 1;
  while (pos < text.length && text[pos] === ' ') pos += 1;
  return pos;
}

export function useComposer({
  active,
  onSubmit,
  onEscape,
}: {
  active: boolean;
  onSubmit: (value: string) => void;
  onEscape: () => void;
}) {
  const [value, setValue] = useState('');
  const [cursor, setCursor] = useState(0);

  const reset = useCallback(() => {
    setValue('');
    setCursor(0);
  }, []);

  useInput(
    (input, key) => {
      if (!active) {
        return;
      }
      if (key.escape) {
        if (value.length === 0) {
          onEscape();
        }
        return;
      }
      if (key.return) {
        const trimmed = value.trim();
        if (trimmed) {
          onSubmit(trimmed);
          reset();
        }
        return;
      }
      if (key.leftArrow) {
        setCursor(current => (key.meta ? 0 : Math.max(0, current - 1)));
        return;
      }
      if (key.rightArrow) {
        setCursor(current => (key.meta ? value.length : Math.min(value.length, current + 1)));
        return;
      }
      if (key.backspace || key.delete) {
        if (cursor === 0) return;
        setValue(current => current.slice(0, cursor - 1) + current.slice(cursor));
        setCursor(current => Math.max(0, current - 1));
        return;
      }
      if (key.ctrl && input === 'a') {
        setCursor(0);
        return;
      }
      if (key.ctrl && input === 'e') {
        setCursor(value.length);
        return;
      }
      if (key.ctrl && input === 'w') {
        const nextCursor = prevWordBoundary(value, cursor);
        setValue(current => current.slice(0, nextCursor) + current.slice(cursor));
        setCursor(nextCursor);
        return;
      }
      if (key.ctrl && input === 'u') {
        setValue(current => current.slice(cursor));
        setCursor(0);
        return;
      }
      if (key.ctrl && input === 'k') {
        setValue(current => current.slice(0, cursor));
        return;
      }
      if (key.meta && input === 'b') {
        setCursor(current => prevWordBoundary(value, current));
        return;
      }
      if (key.meta && input === 'f') {
        setCursor(current => nextWordBoundary(value, current));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setValue(current => current.slice(0, cursor) + input + current.slice(cursor));
        setCursor(current => current + input.length);
      }
    },
    { isActive: active }
  );

  const displayLines = useMemo(() => value.split('\n'), [value]);
  return { value, cursor, setValue, reset, displayLines };
}
