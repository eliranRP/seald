import { describe, it, expect } from 'vitest';
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

  it('renders without axe violations', async () => {
    const { container } = renderWithTheme(
      <AuthShell>
        <h1>Sign in</h1>
      </AuthShell>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
