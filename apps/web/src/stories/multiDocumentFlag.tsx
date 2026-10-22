import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Decorator } from '@storybook/react-vite';

const OVERRIDES_KEY = '__SEALD_FEATURE_OVERRIDES__';

function readOverrides(): Record<string, boolean> {
  const current: unknown = Reflect.get(globalThis, OVERRIDES_KEY);
  return typeof current === 'object' && current !== null
    ? { ...(current as Record<string, boolean>) }
    : {};
}

function FlagScope({ children }: { readonly children: ReactNode }) {
  // Set before the story's first render so the gated surface mounts on.
  useState(() => {
    Reflect.set(globalThis, OVERRIDES_KEY, { ...readOverrides(), multiDocumentEnvelopes: true });
    return true;
  });
  useEffect(
    () => () => {
      const next = readOverrides();
      delete next.multiDocumentEnvelopes;
      Reflect.set(globalThis, OVERRIDES_KEY, next);
    },
    [],
  );
  return <>{children}</>;
}

/**
 * Storybook decorator that turns `multiDocumentEnvelopes` on for the
 * story, through the runtime override hook in `shared` (the same one the
 * Playwright harness uses). The flag ships off, so stories of the gated
 * surfaces need this to render them. It is restored when the story
 * unmounts.
 */
export const withMultiDocumentFlag: Decorator = (Story) => (
  <FlagScope>
    <Story />
  </FlagScope>
);
