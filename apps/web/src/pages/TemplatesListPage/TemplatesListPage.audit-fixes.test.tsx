import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TemplatesListPage } from './TemplatesListPage';
import { SAMPLE_TEMPLATES as TEMPLATES } from '../../test/templateFixtures';
import { renderWithProviders } from '../../test/renderWithProviders';

/**
 * Regression coverage for PR-7 (audit slice A — Sender):
 *   H-8  TemplatesListPage `Inner` is centered with `margin: 0 auto` so
 *        content no longer hugs the left page edge at ≥1320 px.
 *   M-10 The shared `PageHeader` is rendered instead of the bespoke 32 px
 *        title + lede.
 *   M-11 With zero templates and no filter, only ONE "Create your first
 *        template" CTA is rendered (the empty grid + duplicate header
 *        button used to read as a strange one-card grid).
 */

function renderWithTemplates(initial: typeof TEMPLATES) {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/templates']}>
      <Routes>
        <Route path="/templates" element={<TemplatesListPage initialTemplates={initial} />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TemplatesListPage — audit-fix regressions (PR-7)', () => {
  it('H-8: the Inner container is centered with margin: 0 auto', () => {
    renderWithTemplates(TEMPLATES);
    // The eyebrow lives inside PageHeader, which lives inside Inner.
    const eyebrow = screen.getByText(/^templates$/i);
    // Walk up to the Inner — it's the only ancestor with both
    // max-width: 1280px and margin: 0 auto rules attached.
    const innerRule = (() => {
      let cur: HTMLElement | null = eyebrow as HTMLElement;
      const allStyles = Array.from(document.querySelectorAll('style'))
        .map((s) => s.textContent ?? '')
        .join('\n');
      while (cur) {
        const classes = (cur.className || '').split(' ').filter(Boolean);
        for (const cls of classes) {
          const re = new RegExp(`\\.${cls}\\s*\\{[^}]*\\}`, 'i');
          const match = allStyles.match(re)?.[0];
          if (match && /max-width:\s*1280px/i.test(match) && /margin:\s*0\s*auto/i.test(match)) {
            return match;
          }
        }
        cur = cur.parentElement;
      }
      return null;
    })();
    expect(innerRule).not.toBeNull();
    expect(innerRule).toMatch(/margin:\s*0\s*auto/i);
    expect(innerRule).toMatch(/max-width:\s*1280px/i);
  });

  it('M-10: the shared PageHeader is used (eyebrow + H1 pattern)', () => {
    renderWithTemplates(TEMPLATES);
    // PageHeader renders the title as an H1. With our wiring
    // "Place fields once. Reuse forever." becomes the H1 and
    // "Templates" becomes the eyebrow microcopy.
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.textContent).toMatch(/place fields once\. reuse forever\./i);
    expect(screen.getByText(/^templates$/i)).toBeInTheDocument();
  });

  it('M-11: empty + unfiltered renders ONE "Create your first template" CTA only', () => {
    renderWithTemplates([]);
    // The duplicate "New template" header button must NOT appear when
    // the user has nothing yet. The only CTA is the centered first-run
    // card's "Create your first template" button.
    const createButtons = screen.getAllByRole('button', {
      name: /create your first template/i,
    });
    expect(createButtons).toHaveLength(1);
    // And the duplicate dashed-tile grid + "New template" header button
    // are both absent so the page reads as a clean welcome instead of
    // a half-empty grid.
    expect(screen.queryByRole('button', { name: /^new template$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /create a new template/i })).toBeNull();
  });
});
