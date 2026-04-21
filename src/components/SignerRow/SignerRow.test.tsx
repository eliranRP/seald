import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { createRef } from 'react';
import { renderWithTheme } from '../../test/renderWithTheme';
import { SignerRow } from './SignerRow';
import type { Signer } from '../../types/sealdTypes';

const signer: Signer = {
  id: 's1',
  name: 'Jamie Okonkwo',
  email: 'jamie@seald.app',
  status: 'awaiting-you',
};

describe('SignerRow', () => {
  it('renders name, email, and status', () => {
    const { getByText } = renderWithTheme(<SignerRow signer={signer} />);
    expect(getByText('Jamie Okonkwo')).toBeInTheDocument();
    expect(getByText('jamie@seald.app')).toBeInTheDocument();
    expect(getByText('Awaiting you')).toBeInTheDocument();
  });

  it('renders menu button with verbose aria-label', () => {
    const { getByRole } = renderWithTheme(<SignerRow signer={signer} />);
    expect(getByRole('button', { name: /Actions for Jamie Okonkwo/ })).toBeInTheDocument();
  });

  it('menu button fires onMenuClick with signer id', async () => {
    const onMenuClick = vi.fn();
    const { getByRole } = renderWithTheme(<SignerRow signer={signer} onMenuClick={onMenuClick} />);
    await userEvent.click(getByRole('button'));
    expect(onMenuClick).toHaveBeenCalledWith('s1', expect.anything());
  });

  it('hides menu when showMenu={false}', () => {
    const { queryByRole } = renderWithTheme(<SignerRow signer={signer} showMenu={false} />);
    expect(queryByRole('button')).toBeNull();
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(<SignerRow signer={signer} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  // Pattern tests
  it('forwards ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    renderWithTheme(<SignerRow ref={ref} signer={signer} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('forwards data-* rest props to the root element', () => {
    const { container } = renderWithTheme(<SignerRow signer={signer} data-testid="my-row" />);
    expect(container.querySelector('[data-testid="my-row"]')).not.toBeNull();
  });
});
