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

// jsdom doesn't implement IntersectionObserver. Components that observe page
// visibility (e.g. SigningFillPage's scroll-spy on currentPage) crash on
// `new IntersectionObserver(...)` during effect mount. Provide an inert stub
// — tests that need to assert intersection behaviour should override per-test.
// `class-methods-use-this` is disabled inside the stubs because the no-op
// observer methods deliberately don't reference instance state.
/* eslint-disable class-methods-use-this */
if (
  typeof (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver === 'undefined'
) {
  class StubIntersectionObserver {
    readonly root: Element | null = null;

    readonly rootMargin: string = '';

    readonly thresholds: ReadonlyArray<number> = [];

    observe(): void {}

    unobserve(): void {}

    disconnect(): void {}

    takeRecords(): ReadonlyArray<unknown> {
      return [];
    }
  }
  (globalThis as { IntersectionObserver: unknown }).IntersectionObserver = StubIntersectionObserver;
}

// jsdom doesn't implement ResizeObserver either; same defensive stub for any
// component that uses it for layout adaptation.
if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === 'undefined') {
  class StubResizeObserver {
    observe(): void {}

    unobserve(): void {}

    disconnect(): void {}
  }
  (globalThis as { ResizeObserver: unknown }).ResizeObserver = StubResizeObserver;
}
/* eslint-enable class-methods-use-this */

// jsdom doesn't implement Element.scrollTo / window.scrollTo. PageThumbRail's
// debounced auto-scroll fires on a 120ms timeout that runs *after* the test
// completes, surfacing as an "Unhandled Errors" entry that fails the suite
// even though every test passes. A no-op stub is sufficient — no test asserts
// on scroll position.
if (typeof Element.prototype.scrollTo !== 'function') {
  Element.prototype.scrollTo = function noopScrollTo(): void {};
}
if (typeof window.scrollTo !== 'function') {
  window.scrollTo = ((): void => {}) as typeof window.scrollTo;
}

// Rule 3.6 — Network guard.
// Vitest tests must never reach the real network; an unmocked request is
// always a test bug (forgotten MSW handler, missed `vi.mock`, etc.). We
// don't ship MSW here, so the cheapest enforcement is a fetch shim that
// throws with an actionable message. Tests that need to talk HTTP must
// install their own `vi.spyOn(globalThis, 'fetch')` or axios adapter
// inside the spec — the override is per-test and the global guard
// re-applies via `restoreMocks: true`.
const originalFetch = globalThis.fetch;
globalThis.fetch = ((input: RequestInfo | URL, _init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  throw new Error(
    `Refusing to make a real network request from a vitest run.\n` +
      `URL: ${url}\n` +
      `Mock the call (vi.mock(...) / vi.spyOn(globalThis, 'fetch') / axios mock) before invoking ` +
      `the code under test, or extend src/test/setup.ts if a global allow-list is genuinely needed.`,
  );
}) as typeof fetch;
// Keep a handle on the original for any test that explicitly opts back
// in (e.g. a contract test that hits a local supertest server).
(globalThis as unknown as { __originalFetch?: typeof fetch }).__originalFetch = originalFetch;
