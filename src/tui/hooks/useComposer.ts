import { useInput } from "ink";
import { useMemo, useState } from "react";

interface ComposerOptions {
  disabled?: boolean;
  onSubmit: (value: string) => Promise<void> | void;
}

export function useComposer(options: ComposerOptions) {
  const [value, setValue] = useState("");
  const [cursor, setCursor] = useState(0);

  useInput(async (input, key) => {
    if (options.disabled) {
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

      setValue((current) => current.slice(0, cursor - 1) + current.slice(cursor));
      setCursor((current) => Math.max(0, current - 1));
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
      setValue((current) => current.slice(0, cursor) + input + current.slice(cursor));
      setCursor((current) => current + input.length);
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
