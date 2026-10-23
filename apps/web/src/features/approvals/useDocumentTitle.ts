import { useEffect } from 'react';

/**
 * Sets the tab title for one approval screen and restores the previous one
 * on leave. Every SPA route otherwise inherits the shell's title.
 */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} · Seald`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
