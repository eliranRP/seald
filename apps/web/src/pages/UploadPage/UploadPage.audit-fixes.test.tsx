import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { UploadPage } from './UploadPage';
import { seald } from '../../styles/theme';

/**
 * Regression coverage for PR-7 (audit slice A — Sender):
 *   H-1  The heading + subtitle render centered above the dropzone
 *        instead of left-aligned at the 960 px Inner's left edge with
 *        empty whitespace to the right (which read as a broken
 *        two-column).
 */

function renderPage() {
  return render(
    <ThemeProvider theme={seald}>
      <UploadPage onFileSelected={vi.fn()} />
    </ThemeProvider>,
  );
}

describe('UploadPage — audit-fix regressions (PR-7)', () => {
  it('H-1: heading + subtitle render inside a centered text block', () => {
    renderPage();
    const heading = screen.getByRole('heading', { level: 1, name: /start a new document/i });
    // The heading's parent is the HeadingBlock styled-component, which
    // applies `text-align: center`. Pull the rendered style rule out
    // of the injected <style> tags and assert it sets center alignment.
    const parent = heading.parentElement;
    expect(parent).not.toBeNull();
    const classes = (parent?.className ?? '').split(' ').filter(Boolean);
    expect(classes.length).toBeGreaterThan(0);
    const allStyles = Array.from(document.querySelectorAll('style'))
      .map((s) => s.textContent ?? '')
      .join('\n');
    const matchingRule = classes
      .map((cls) => {
        const re = new RegExp(`\\.${cls}\\s*\\{[^}]*\\}`, 'i');
        return allStyles.match(re)?.[0];
      })
      .find((r): r is string => !!r);
    expect(matchingRule).toBeDefined();
    expect(matchingRule).toMatch(/text-align:\s*center/i);
  });
});
