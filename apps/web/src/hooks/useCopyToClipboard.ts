import { useEffect, useState } from 'react';

const RESET_MS = 2000;

export interface CopyToClipboard {
  readonly copied: boolean;
  /** Resolves true when the text reached the clipboard. */
  readonly copy: (text: string) => Promise<boolean>;
}

/**
 * Writes text to the clipboard and reports `copied` for a short window.
 * Resolves false when the Clipboard API is missing or rejects.
 */
export function useCopyToClipboard(): CopyToClipboard {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return undefined;
    const id = window.setTimeout(() => {
      setCopied(false);
    }, RESET_MS);
    return () => {
      window.clearTimeout(id);
    };
  }, [copied]);

  const copy = async (text: string): Promise<boolean> => {
    const clip = navigator.clipboard as Clipboard | undefined;
    if (!clip || typeof clip.writeText !== 'function') return false;
    try {
      await clip.writeText(text);
      setCopied(true);
      return true;
    } catch {
      return false;
    }
  };

  return { copied, copy };
}
