import { useInput } from "ink";
import { useMemo, useState } from "react";

interface ComposerOptions {
  disabled?: boolean;
  suppressInput?: boolean;
  onSubmit: (value: string) => Promise<void> | void;
  onSlash?: () => void;
  onSlashChange?: (filter: string) => void;
}

export function useComposer(options: ComposerOptions) {
  const [value, setValue] = useState("");
  const [cursor, setCursor] = useState(0);

  useInput(async (input, key) => {
    if (options.disabled || options.suppressInput) {
      return;
    }

    if (key.return) {
      const trimmed = value.trim();

      if (!trimmed) {
        return;
      }

      setValue("");
      setCursor(0);
      await options.onSubmit(trimmed);
      return;
    }

    if (key.backspace || key.delete) {
      if (cursor === 0) {
        return;
      }

      const next = value.slice(0, cursor - 1) + value.slice(cursor);
      setValue(next);
      setCursor((current) => Math.max(0, current - 1));
      if (next.startsWith("/") && options.onSlashChange) {
        options.onSlashChange(next.slice(1));
      } else if (!next.startsWith("/") && options.onSlashChange) {
        options.onSlashChange("");
      }
      return;
    }

    if (key.leftArrow) {
      setCursor((current) => Math.max(0, current - 1));
      return;
    }

    if (key.rightArrow) {
      setCursor((current) => Math.min(value.length, current + 1));
      return;
    }

    if (key.ctrl && input === "j") {
      setValue((current) => current.slice(0, cursor) + "\n" + current.slice(cursor));
      setCursor((current) => current + 1);
      return;
    }

    if (input.length > 0 && !key.ctrl && !key.meta) {
      const next = value.slice(0, cursor) + input + value.slice(cursor);
      setValue(next);
      setCursor((current) => current + input.length);
      // Trigger slash menu when typing "/" at position 0
      if (next.startsWith("/") && options.onSlash) {
        if (next === "/") {
          options.onSlash();
        }
        if (options.onSlashChange) {
          options.onSlashChange(next.slice(1));
        }
      }
    }
  });

  return useMemo(
    () => ({
      value,
      cursor,
      setValue,
      setCursor,
    }),
    [cursor, value],
  );
}
