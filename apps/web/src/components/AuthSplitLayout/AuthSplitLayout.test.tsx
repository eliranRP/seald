import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, within } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '@/test/renderWithTheme';
import { AuthSplitLayout } from './AuthSplitLayout';

describe('AuthSplitLayout', () => {
  afterEach(() => {
    delete (window as unknown as { SealdConsent?: unknown }).SealdConsent;
  });

  it('renders children in the form column', () => {
    const { getByRole } = renderWithTheme(
      <AuthSplitLayout>
        <h1>Sign in or create account</h1>
      </AuthSplitLayout>,
    );
    expect(getByRole('heading', { name: 'Sign in or create account' })).toBeInTheDocument();
  });

  it('shows the product panel with its three benefits', () => {
    const { getByRole } = renderWithTheme(
      <AuthSplitLayout>
        <div>form</div>
      </AuthSplitLayout>,
    );
    const panel = getByRole('complementary');
    expect(
      within(panel)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Sign in 1 minute', 'Sealed + tamper-proof', 'Track every signer']);
  });

  it('hides the panel when hidePanel is set', () => {
    const { queryByRole } = renderWithTheme(
      <AuthSplitLayout hidePanel>
        <div>form</div>
      </AuthSplitLayout>,
    );
    expect(queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('forwards ref to the root element', () => {
    const ref = { current: null as HTMLDivElement | null };
    renderWithTheme(
      <AuthSplitLayout ref={ref}>
        <div>form</div>
      </AuthSplitLayout>,
    );
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('renders the four trust links', () => {
    const { getByRole } = renderWithTheme(
      <AuthSplitLayout>
        <div>form</div>
      </AuthSplitLayout>,
    );
    expect(getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/legal/terms');
    expect(getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/legal/privacy');
    expect(getByRole('link', { name: 'Accessibility' })).toHaveAttribute(
      'href',
      '/legal/accessibility',
    );
    expect(getByRole('link', { name: 'Report a vulnerability' })).toHaveAttribute(
      'href',
      '/legal/responsible-disclosure',
    );
  });

  it('opens the cookie banner from the preferences button', () => {
    const openBanner = vi.fn();
    (window as unknown as { SealdConsent: unknown }).SealdConsent = {
      openBanner,
      getChoice: () => null,
    };
    const { getByRole } = renderWithTheme(
      <AuthSplitLayout>
        <div>form</div>
      </AuthSplitLayout>,
    );
    fireEvent.click(getByRole('button', { name: 'Manage cookie preferences' }));
    expect(openBanner).toHaveBeenCalledTimes(1);
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(
      <AuthSplitLayout>
        <h1>Title</h1>
      </AuthSplitLayout>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
