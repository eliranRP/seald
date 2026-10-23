import { describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '@/test/renderWithTheme';
import { TemplateChip } from './TemplateChip';

describe('TemplateChip', () => {
  it('shows the name and signer count and fires onClick', () => {
    const onClick = vi.fn();
    const { getByRole, getByLabelText } = renderWithTheme(
      <TemplateChip name="NDA — mutual" signers={2} onClick={onClick} />,
    );
    expect(getByLabelText('2 signers')).toBeInTheDocument();
    fireEvent.click(getByRole('button', { name: /nda — mutual/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('omits the count when unknown', () => {
    const { queryByLabelText } = renderWithTheme(<TemplateChip name="Photo release" />);
    expect(queryByLabelText(/signer/)).toBeNull();
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(<TemplateChip name="Offer letter" signers={1} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
