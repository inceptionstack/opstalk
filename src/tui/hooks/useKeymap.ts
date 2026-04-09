import { useInput } from 'ink';
import type { UiMode } from '../lib/types.js';

interface UseKeymapOptions {
  mode: UiMode;
  composerValue: string;
  onSwitchToInput: () => void;
  onSwitchToScroll: () => void;
  onScrollUp: (amount?: number) => void;
  onScrollDown: (amount?: number) => void;
  onScrollTop: () => void;
  onScrollBottom: () => void;
  onAbortOrQuit: () => void;
}

export function useKeymap(options: UseKeymapOptions): void {
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      options.onAbortOrQuit();
      return;
    }

    if (options.mode === 'scroll') {
      if (input === 'i' || key.return) {
        options.onSwitchToInput();
        return;
      }
      if (key.upArrow) {
        options.onScrollUp(1);
        return;
      }
      if (key.downArrow) {
        options.onScrollDown(1);
        return;
      }
      if (key.pageUp) {
        options.onScrollUp(10);
        return;
      }
      if (key.pageDown) {
        options.onScrollDown(10);
        return;
      }
      if (input === 'g') {
        options.onScrollTop();
        return;
      }
      if (input === 'G') {
        options.onScrollBottom();
      }
      return;
    }

    if (key.escape && options.composerValue.length === 0) {
      options.onSwitchToScroll();
    }
  });
}
