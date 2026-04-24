import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithTheme } from '../../test/renderWithTheme';
import { SignerStack } from './SignerStack';
import type { SignerStackEntry } from './SignerStack.types';

const mk = (over: Partial<SignerStackEntry>): SignerStackEntry => ({
  id: over.id ?? 'id',
  name: over.name ?? 'Ada Lovelace',
  email: over.email ?? 'ada@example.com',
  status: over.status ?? 'pending',
});

describe('SignerStack', () => {
  it('renders initials for each visible signer and the signed/total fraction', () => {
    renderWithTheme(
      <SignerStack
        signers={[
          mk({ id: '1', name: 'Ada Lovelace', status: 'signed' }),
          mk({ id: '2', name: 'Bob Byte', status: 'pending' }),
        ]}
      />,
    );
    expect(screen.getByText('AL')).toBeInTheDocument();
    expect(screen.getByText('BB')).toBeInTheDocument();
    expect(screen.getByText('1/2 signed')).toBeInTheDocument();
  });

  it('caps visible avatars to maxVisible and renders +N overflow chip', () => {
    const signers = Array.from({ length: 7 }, (_, i) =>
      mk({ id: `s${i}`, name: `Name${i} Last${i}`, status: 'pending' }),
    );
    renderWithTheme(<SignerStack signers={signers} />);
    expect(screen.getByText('+3')).toBeInTheDocument();
    expect(screen.getByLabelText('3 more signers')).toBeInTheDocument();
  });

  it('opens the popover on hover with every signer row', async () => {
    const user = userEvent.setup();
    const signers = [
      mk({ id: '1', name: 'Ada Lovelace', email: 'ada@example.com', status: 'signed' }),
      mk({ id: '2', name: 'Bob Byte', email: 'bob@example.com', status: 'declined' }),
    ];
    const { container } = renderWithTheme(<SignerStack signers={signers} />);
    const root = container.firstElementChild as HTMLElement;
    await user.hover(root);
    expect(screen.getByText('bob@example.com')).toBeInTheDocument();
    expect(screen.getByText('Declined')).toBeInTheDocument();
    await user.unhover(root);
    expect(screen.queryByText('bob@example.com')).not.toBeInTheDocument();
  });

  it('counts only signed signers in the fraction', () => {
    renderWithTheme(
      <SignerStack
        signers={[
          mk({ id: '1', status: 'signed' }),
          mk({ id: '2', status: 'signed' }),
          mk({ id: '3', status: 'declined' }),
          mk({ id: '4', status: 'pending' }),
        ]}
      />,
    );
    expect(screen.getByText('2/4 signed')).toBeInTheDocument();
  });
});
