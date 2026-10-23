import { describe, expect, it } from 'vitest';
import { Ban, Check } from 'lucide-react';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '@/test/renderWithTheme';
import { StatusPage } from './StatusPage';

describe('StatusPage', () => {
  it('shows the logo-only header, the heading and the stacked content', async () => {
    const { getByRole, getByText, container } = renderWithTheme(
      <StatusPage tone="success" icon={Check} title="Signed">
        <span>Eliran gets it now.</span>
      </StatusPage>,
    );
    expect(getByText('Seald')).toBeInTheDocument();
    expect(getByRole('heading', { level: 1, name: 'Signed' })).toBeInTheDocument();
    expect(getByText('Eliran gets it now.')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders with no body content', () => {
    const { getByRole } = renderWithTheme(
      <StatusPage tone="neutral" icon={Ban} title="Request withdrawn" />,
    );
    expect(getByRole('heading', { name: 'Request withdrawn' })).toBeInTheDocument();
  });
});
