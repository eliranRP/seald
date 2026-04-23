/* eslint-disable max-classes-per-file */
import '@testing-library/jest-dom/vitest';
import { expect } from 'vitest';
import * as axeMatchers from 'vitest-axe/matchers';

expect.extend(axeMatchers);

// jsdom doesn't implement DOMMatrix / Path2D, but pdfjs-dist references both
// at module-eval time (canvas rendering path). Provide minimal class stubs so
// importing `pdfjs-dist` from tests doesn't throw. Tests exercising real PDF
// rendering mock pdfjs or `getContext` directly — these stubs are only here
// to satisfy the import; they're never expected to compute real matrices.
const g = globalThis as unknown as {
  DOMMatrix?: unknown;
  Path2D?: unknown;
  ImageData?: unknown;
};
if (typeof g.DOMMatrix === 'undefined') {
  g.DOMMatrix = class DOMMatrix {};
}
if (typeof g.Path2D === 'undefined') {
  g.Path2D = class Path2D {};
}
if (typeof g.ImageData === 'undefined') {
  g.ImageData = class ImageData {};
}

if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
