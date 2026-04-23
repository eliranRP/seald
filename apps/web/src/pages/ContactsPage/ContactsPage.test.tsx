import { describe, expect, it } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ContactsPage } from './ContactsPage';
import { renderWithProviders } from '../../test/renderWithProviders';

function renderContacts() {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/signers']}>
      <ContactsPage />
    </MemoryRouter>,
  );
}

describe('ContactsPage', () => {
  it('renders seed contacts', async () => {
    renderContacts();
    expect(await screen.findByText(/eliran azulay/i)).toBeInTheDocument();
    expect(await screen.findByText(/priya kapoor/i)).toBeInTheDocument();
  });

  it('adds a new signer through the dialog', async () => {
    renderContacts();
    await screen.findByText(/eliran azulay/i);
    await userEvent.click(screen.getByRole('button', { name: /^add signer$/i }));
    const dialog = screen.getByRole('dialog', { name: /^add signer$/i });
    const inputs = dialog.querySelectorAll('input');
    const nameInput = inputs[0] as HTMLInputElement;
    const emailInput = inputs[1] as HTMLInputElement;
    await userEvent.type(nameInput, 'Test Person');
    await userEvent.type(emailInput, 'test@example.com');
    await userEvent.click(within(dialog).getByRole('button', { name: /^add signer$/i }));
    expect(screen.getByText(/test person/i)).toBeInTheDocument();
    expect(screen.getByText(/test@example\.com/i)).toBeInTheDocument();
  });

  it('validates email before saving', async () => {
    renderContacts();
    await screen.findByText(/eliran azulay/i);
    await userEvent.click(screen.getByRole('button', { name: /^add signer$/i }));
    const dialog = screen.getByRole('dialog', { name: /^add signer$/i });
    const inputs = dialog.querySelectorAll('input');
    const nameInput = inputs[0] as HTMLInputElement;
    const emailInput = inputs[1] as HTMLInputElement;
    await userEvent.type(nameInput, 'Bad Email');
    await userEvent.type(emailInput, 'not-an-email');
    await userEvent.click(within(dialog).getByRole('button', { name: /^add signer$/i }));
    expect(screen.getByText(/please enter a valid email/i)).toBeInTheDocument();
  });

  it('delete opens the confirm dialog and only removes on confirm', async () => {
    renderContacts();
    await screen.findByText(/eliran azulay/i);
    const deleteButtons = screen.getAllByRole('button', { name: /^delete /i });
    const firstDelete = deleteButtons[0];
    expect(firstDelete).toBeDefined();
    fireEvent.click(firstDelete!);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^remove$/i }));
    // Eliran Azulay was the first seed contact — should now be gone.
    expect(screen.queryByText(/eliran azulay/i)).toBeNull();
  });
});
