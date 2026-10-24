import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '@/test/renderWithTheme';
import { Banner } from './Banner';

describe('Banner', () => {
  it('renders an info banner as a polite status', () => {
    const { getByRole } = renderWithTheme(<Banner>We sent a new link.</Banner>);
    expect(getByRole('status')).toHaveTextContent('We sent a new link.');
  });

  it('renders an error banner as an alert', () => {
    const { getByRole } = renderWithTheme(<Banner tone="error">That link expired.</Banner>);
    expect(getByRole('alert')).toHaveTextContent('That link expired.');
  });

  it('renders the trailing action', () => {
    const { getByRole } = renderWithTheme(
      <Banner tone="ok" action={<button type="button">Undo</button>}>
        Saved
      </Banner>,
    );
    expect(getByRole('button', { name: 'Undo' })).toBeInTheDocument();
  });

  it('omits the icon when icon={null}', () => {
    const { container } = renderWithTheme(<Banner icon={null}>Plain</Banner>);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(<Banner tone="error">Oops</Banner>);
    expect(await axe(container)).toHaveNoViolations();
  });
});
