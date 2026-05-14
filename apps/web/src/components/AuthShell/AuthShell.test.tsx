import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '../../test/renderWithTheme';
import { AuthShell } from './AuthShell';

describe('AuthShell', () => {
  it('renders children in the form slot', () => {
    const { getByText } = renderWithTheme(
      <AuthShell>
        <h1>Welcome back</h1>
      </AuthShell>,
    );
    expect(getByText('Welcome back')).toBeInTheDocument();
  });

  it('renders the brand panel by default', () => {
    const { getByRole } = renderWithTheme(
      <AuthShell>
        <div>form</div>
      </AuthShell>,
    );
    expect(getByRole('complementary')).toBeInTheDocument();
  });

  it('hides the brand panel in compact mode', () => {
    const { queryByRole } = renderWithTheme(
      <AuthShell compact>
        <div>form</div>
      </AuthShell>,
    );
    expect(queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('forwards ref to the root element', () => {
    const ref = { current: null as HTMLDivElement | null };
    renderWithTheme(
      <AuthShell ref={ref}>
        <div>form</div>
      </AuthShell>,
    );
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('renders the legal/accessibility footer with all four trust links', () => {
    const { getByRole } = renderWithTheme(
      <AuthShell>
        <h1>Sign in</h1>
      </AuthShell>,
    );
    const foot = getByRole('contentinfo', { name: /legal and accessibility/i });
    expect(foot).toBeInTheDocument();
    expect(foot.querySelector('a[href="/legal/privacy"]')).toBeInTheDocument();
    expect(foot.querySelector('a[href="/legal/terms"]')).toBeInTheDocument();
    expect(foot.querySelector('a[href="/legal/accessibility"]')).toBeInTheDocument();
    expect(foot.querySelector('a[href="/legal/responsible-disclosure"]')).toBeInTheDocument();
  });

  describe('cookie-preferences button (T-30)', () => {
    afterEach(() => {
      delete (window as unknown as { SealdConsent?: unknown }).SealdConsent;
    });

    it('renders the manage-cookies button next to the trust links', () => {
      const { getByRole } = renderWithTheme(
        <AuthShell>
          <h1>Sign in</h1>
        </AuthShell>,
      );
      const btn = getByRole('button', { name: /manage cookie preferences/i });
      expect(btn).toBeInTheDocument();
      expect(btn).toHaveAttribute('type', 'button');
    });

    it('opens the consent banner when clicked', () => {
      const openBanner = vi.fn();
      (
        window as unknown as { SealdConsent: { openBanner: () => void; getChoice: () => null } }
      ).SealdConsent = { openBanner, getChoice: () => null };
      const { getByRole } = renderWithTheme(
        <AuthShell>
          <h1>Sign in</h1>
        </AuthShell>,
      );
      fireEvent.click(getByRole('button', { name: /manage cookie preferences/i }));
      expect(openBanner).toHaveBeenCalledTimes(1);
    });

    it('no-ops gracefully when the consent runtime has not loaded yet', () => {
      // The script tag is `defer` so SealdConsent may not exist at click time
      // for the first tick of the page. The button must not throw.
      const { getByRole } = renderWithTheme(
        <AuthShell>
          <h1>Sign in</h1>
        </AuthShell>,
      );
      expect(() =>
        fireEvent.click(getByRole('button', { name: /manage cookie preferences/i })),
      ).not.toThrow();
    });
  });

  it('renders without axe violations', async () => {
    const { container } = renderWithTheme(
      <AuthShell>
        <h1>Sign in</h1>
      </AuthShell>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  // Audit D §10 — mobile/tablet (≤ 960 px) collapses the brand panel,
  // leaving the form column logo-less. The AuthMobileHeader injects a
  // slim wordmark above the form so the page identifies as Seald on
  // foldable / tablet viewports. The mobile header lives inside the
  // FormSide (the form column) — the brand panel's wordmark sits inside
  // the <aside> on the desktop side.
  it('renders a wordmark inside the FormSide for tablet/phone viewports', () => {
    const { container } = renderWithTheme(
      <AuthShell>
        <h1>Sign in</h1>
      </AuthShell>,
    );
    // The mobile-only header sets role=img + aria-label="Seald" and lives
    // outside the brand-panel <aside>. Counting both occurrences detects
    // the regression where the FormSide-side wordmark is missing — the
    // desktop AuthBrandPanel always contributes one "Seald" wordmark.
    const wordmarks = container.querySelectorAll('[role="img"][aria-label="Seald"]');
    expect(wordmarks.length).toBeGreaterThanOrEqual(1);
    // And the mobile header lives OUTSIDE the brand <aside>.
    const aside = container.querySelector('aside');
    const outsideAside = Array.from(wordmarks).filter((el) => !aside?.contains(el));
    expect(outsideAside.length).toBeGreaterThanOrEqual(1);
  });

  it('omits the slim mobile wordmark in compact mode', () => {
    const { container } = renderWithTheme(
      <AuthShell compact>
        <h1>Sign in</h1>
      </AuthShell>,
    );
    expect(container.querySelectorAll('[role="img"][aria-label="Seald"]').length).toBe(0);
  });
});
