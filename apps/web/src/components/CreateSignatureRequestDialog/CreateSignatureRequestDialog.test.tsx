import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '../../test/renderWithTheme';
import { CreateSignatureRequestDialog } from './CreateSignatureRequestDialog';
import type { CreateSignatureRequestDialogSigner } from './CreateSignatureRequestDialog.types';
import type { AddSignerContact } from '../AddSignerDropdown';

const CONTACTS: ReadonlyArray<AddSignerContact> = [
  { id: 'c1', name: 'Ada Byron', email: 'ada@byron.io', color: '#F472B6' },
  { id: 'c2', name: 'Alan Turing', email: 'alan@turing.io', color: '#7DD3FC' },
];

const NO_SIGNERS: ReadonlyArray<CreateSignatureRequestDialogSigner> = [];
const ONE_SIGNER: ReadonlyArray<CreateSignatureRequestDialogSigner> = [
  { id: 'c1', name: 'Ada Byron', email: 'ada@byron.io', color: '#F472B6' },
];

function baseProps() {
  return {
    contacts: CONTACTS,
    onAddFromContact: vi.fn(),
    onCreateContact: vi.fn(),
    onRemoveSigner: vi.fn(),
    onApply: vi.fn(),
    onCancel: vi.fn(),
  };
}

describe('CreateSignatureRequestDialog', () => {
  it('renders nothing when open is false', () => {
    const { container } = renderWithTheme(
      <CreateSignatureRequestDialog open={false} signers={NO_SIGNERS} {...baseProps()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the dialog with title, subtitle, and empty hint when signers is empty', () => {
    const { getByRole, getByText } = renderWithTheme(
      <CreateSignatureRequestDialog open signers={NO_SIGNERS} {...baseProps()} />,
    );
    expect(getByRole('dialog', { name: /create your signature request/i })).toBeInTheDocument();
    expect(getByText(/who will receive your document/i)).toBeInTheDocument();
    expect(getByText(/add at least one receiver to continue/i)).toBeInTheDocument();
  });

  it('disables Apply until at least one signer is added', () => {
    const { getByRole, rerender } = renderWithTheme(
      <CreateSignatureRequestDialog open signers={NO_SIGNERS} {...baseProps()} />,
    );
    expect(getByRole('button', { name: /apply/i })).toBeDisabled();

    rerender(<CreateSignatureRequestDialog open signers={ONE_SIGNER} {...baseProps()} />);
    expect(getByRole('button', { name: /apply/i })).not.toBeDisabled();
  });

  it('shows each signer as a compact chip with name and a remove button', () => {
    const onRemoveSigner = vi.fn();
    const { getByText, getByRole } = renderWithTheme(
      <CreateSignatureRequestDialog
        open
        signers={ONE_SIGNER}
        {...baseProps()}
        onRemoveSigner={onRemoveSigner}
      />,
    );
    // Compact chip shows the name (email is carried in the chip's title tooltip
    // so the dialog width stays stable as signers are added).
    expect(getByText('Ada Byron')).toBeInTheDocument();
    const removeBtn = getByRole('button', { name: /remove receiver ada byron/i });
    removeBtn.click();
    expect(onRemoveSigner).toHaveBeenCalledWith('c1');
  });

  it('opens the inline receiver picker and fires onAddFromContact when a contact is picked', async () => {
    const user = userEvent.setup();
    const onAddFromContact = vi.fn();
    const { getByRole } = renderWithTheme(
      <CreateSignatureRequestDialog
        open
        signers={NO_SIGNERS}
        {...baseProps()}
        onAddFromContact={onAddFromContact}
      />,
    );
    await user.click(getByRole('button', { name: /add receiver/i }));
    await user.click(getByRole('option', { name: /ada byron/i }));
    expect(onAddFromContact).toHaveBeenCalledTimes(1);
    expect(onAddFromContact.mock.calls[0]?.[0]?.id).toBe('c1');
  });

  it('renders already-added signers as checked rows in the picker and toggles them off on click', async () => {
    const user = userEvent.setup();
    const onRemoveSigner = vi.fn();
    const onAddFromContact = vi.fn();
    const { getByRole } = renderWithTheme(
      <CreateSignatureRequestDialog
        open
        signers={ONE_SIGNER}
        {...baseProps()}
        onRemoveSigner={onRemoveSigner}
        onAddFromContact={onAddFromContact}
      />,
    );
    await user.click(getByRole('button', { name: /add receiver/i }));
    // Ada is already added — her row is visible and checked.
    const ada = getByRole('option', { name: /ada byron/i });
    expect(ada).toHaveAttribute('aria-selected', 'true');
    // Alan isn't added — his row is visible and unchecked.
    const alan = getByRole('option', { name: /alan turing/i });
    expect(alan).toHaveAttribute('aria-selected', 'false');
    // Clicking Ada's row fires onRemoveSigner (toggle off) and does not add.
    await user.click(ada);
    expect(onRemoveSigner).toHaveBeenCalledWith('c1');
    expect(onAddFromContact).not.toHaveBeenCalled();
  });

  it('creates a new contact when the user types an unknown email', async () => {
    const user = userEvent.setup();
    const onCreateContact = vi.fn();
    const { getByRole } = renderWithTheme(
      <CreateSignatureRequestDialog
        open
        signers={NO_SIGNERS}
        {...baseProps()}
        onCreateContact={onCreateContact}
      />,
    );
    await user.click(getByRole('button', { name: /add receiver/i }));
    await user.type(getByRole('searchbox'), 'new.person@example.com');
    await user.click(getByRole('button', { name: /add ".*" as new contact/i }));
    expect(onCreateContact).toHaveBeenCalledWith('new.person', 'new.person@example.com');
  });

  it('fires onApply when Apply is clicked with at least one signer', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const { getByRole } = renderWithTheme(
      <CreateSignatureRequestDialog open signers={ONE_SIGNER} {...baseProps()} onApply={onApply} />,
    );
    await user.click(getByRole('button', { name: /apply/i }));
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('fires onCancel via Cancel button, backdrop click, and Escape', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const { getByRole, getByTestId } = renderWithTheme(
      <CreateSignatureRequestDialog
        open
        signers={NO_SIGNERS}
        {...baseProps()}
        onCancel={onCancel}
      />,
    );
    await user.click(getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    await user.click(getByTestId('create-signature-request-backdrop'));
    expect(onCancel).toHaveBeenCalledTimes(2);
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(3);
  });

  it('has no axe violations when open', async () => {
    const { container } = renderWithTheme(
      <CreateSignatureRequestDialog open signers={ONE_SIGNER} {...baseProps()} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
