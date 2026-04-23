import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { screen } from '@testing-library/react';
import { renderWithTheme } from '../../test/renderWithTheme';
import { EmailCard } from './EmailCard';

describe('EmailCard', () => {
  it('renders its children', () => {
    renderWithTheme(
      <EmailCard>
        <p>Hello from the preview</p>
      </EmailCard>,
    );
    expect(screen.getByText('Hello from the preview')).toBeInTheDocument();
  });

  it('forwards ref', () => {
    const ref = { current: null as HTMLDivElement | null };
    renderWithTheme(
      <EmailCard ref={ref}>
        <span>body</span>
      </EmailCard>,
    );
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(
      <EmailCard>
        <p>body</p>
      </EmailCard>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
