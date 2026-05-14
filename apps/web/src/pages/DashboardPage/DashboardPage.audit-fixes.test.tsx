import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DashboardPage } from './DashboardPage';
import { renderWithProviders } from '../../test/renderWithProviders';

/**
 * Regression coverage for PR-7 (audit slice A — Sender):
 *   M-1  "Showing N documents" caption gains a leading vertical rule
 *        so it anchors against the FilterToolbar chip row instead of
 *        floating as an orphan beside 32 px chips.
 *   L-3  Inactive sort carets render Lucide ChevronDown (12 px) instead
 *        of the U+25BE unicode glyph which read as ▸ at small sizes /
 *        low opacity.
 */

vi.mock('../../lib/api/apiClient', () => {
  const SEED = [
    {
      id: 'env-msa',
      title: 'Master Services Agreement',
      short_code: 'MSA-ABCD-1234',
      status: 'awaiting_others',
      original_pages: 4,
      sent_at: '2026-04-01T00:00:00Z',
      completed_at: null,
      expires_at: '2030-01-01T00:00:00Z',
      created_at: '2026-04-01T00:00:00Z',
      updated_at: '2026-04-01T00:00:00Z',
      signers: [],
    },
  ];
  return {
    apiClient: {
      get: vi.fn(async (url: string) => {
        if (url.startsWith('/envelopes')) {
          return { data: { items: SEED, next_cursor: null }, status: 200 };
        }
        if (url === '/contacts') return { data: [], status: 200 };
        return { data: {}, status: 200 };
      }),
      post: vi.fn(async () => ({ data: {}, status: 201 })),
      patch: vi.fn(async () => ({ data: {}, status: 200 })),
      delete: vi.fn(async () => ({ data: null, status: 204 })),
    },
  };
});

function renderDashboard() {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/documents']}>
      <Routes>
        <Route path="/documents" element={<DashboardPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('DashboardPage — audit-fix regressions (PR-7)', () => {
  it('M-1: the doc-count caption anchors to the toolbar with a left border rule', async () => {
    renderDashboard();
    const caption = await screen.findByText(/showing 1 document/i);
    // styled-components emits its rules into <style> tags injected
    // into the document head. Concatenate every stylesheet's text and
    // look for the class hash this element carries. jsdom can't
    // resolve getComputedStyle through styled-components, so the
    // text-search proves the styled-component shipped the rule.
    const captionClasses = caption.className.split(' ').filter(Boolean);
    expect(captionClasses.length).toBeGreaterThan(0);
    const allStyles = Array.from(document.querySelectorAll('style'))
      .map((s) => s.textContent ?? '')
      .join('\n');
    // Find the rule for any of the caption's class names.
    const matchingRule = captionClasses
      .map((cls) => {
        const re = new RegExp(`\\.${cls}\\s*\\{[^}]*\\}`, 'i');
        return allStyles.match(re)?.[0];
      })
      .find((r): r is string => !!r);
    expect(matchingRule).toBeDefined();
    expect(matchingRule).toMatch(/border-left:\s*1px\s*solid/i);
    expect(matchingRule).toMatch(/padding-left:/);
  });

  it('L-3: every sort header renders a Lucide chevron <svg> instead of the unicode caret', async () => {
    renderDashboard();
    // Wait for the table head to be in the DOM. Column headings are
    // labeled buttons inside the head row.
    const documentSortButton = await screen.findByRole('button', {
      name: /^Document$/i,
    });
    // The Lucide chevron is an <svg> sibling to the label text. The
    // U+25BE unicode caret (the old behaviour) would render as plain
    // text in a <span>; assert the svg is present.
    const svg = documentSortButton.querySelector('svg');
    expect(svg).not.toBeNull();
    // Lucide adds a `lucide` class on its <svg> output.
    expect(svg?.getAttribute('class') ?? '').toMatch(/lucide/);
    // And the old unicode characters must no longer be present.
    expect(documentSortButton.textContent).not.toContain('▾');
    expect(documentSortButton.textContent).not.toContain('▲');
    expect(documentSortButton.textContent).not.toContain('▼');
  });
});
