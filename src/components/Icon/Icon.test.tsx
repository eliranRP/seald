import { describe, it, expect } from 'vitest';
import { axe } from 'vitest-axe';
import { PenTool } from 'lucide-react';
import { renderWithTheme } from '../../test/renderWithTheme';
import { Icon } from './Icon';

describe('Icon', () => {
  it('is aria-hidden by default', () => {
    const { container } = renderWithTheme(<Icon icon={PenTool} />);
    const span = container.querySelector('span');
    expect(span).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders a role="img" with aria-label when label is set', () => {
    const { getByRole } = renderWithTheme(<Icon icon={PenTool} label="Sign" />);
    expect(getByRole('img', { name: 'Sign' })).toBeInTheDocument();
  });

  it('respects size prop', () => {
    const { container } = renderWithTheme(<Icon icon={PenTool} size={24} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '24');
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(<Icon icon={PenTool} label="Pen" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
