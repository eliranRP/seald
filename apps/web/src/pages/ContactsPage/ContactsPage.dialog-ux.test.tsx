import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ContactsPage } from './ContactsPage';
import { renderWithProviders } from '../../test/renderWithProviders';

/**
 * Regression coverage discovered by the templates+contacts QA audit
 * (qa/templates-contacts-bdd, 2026-05-02).
 *
 * Bug B — Pressing Enter inside the Name or Email field of the
 *         add-signer dialog must submit the form. Power senders type
 *         a name, tab to email, type, then press Enter to save —
 *         keeping their hands on the keyboard. Previously the dialog
 *         had no <form> wrapper and Enter did nothing.
 *
 * Bug C — When validation fails because the *name* field is empty,
 *         the error message ("Please enter a name.") was being rendered
 *         under the *email* field because the `error` prop was wired
 *         only to the email TextField. The error must surface against
 *         the field that triggered it.
 */
vi.mock('../../lib/api/apiClient', () => {
  const SEED = [
    {
      id: 'c1',
      owner_id: 't',
      name: 'Eliran Azulay',
      email: 'eliran@azulay.co',
      color: '#F472B6',
      created_at: '',
      updated_at: '',
    },
  ];
  return {
    apiClient: {
      get: vi.fn(async (url: string) => {
        if (url === '/contacts') return { data: SEED, status: 200 };
        return { data: {}, status: 200 };
      }),
      post: vi.fn(async (_url: string, body: { name: string; email: string; color: string }) => ({
        data: {
          id: `c_new_${Date.now()}`,
          owner_id: 't',
          name: body.name,
          email: body.email,
          color: body.color,
          created_at: '',
          updated_at: '',
        },
        status: 201,
      })),
      patch: vi.fn(async (url: string, body: Record<string, unknown>) => ({
        data: { id: url.split('/').pop(), owner_id: 't', ...body, created_at: '', updated_at: '' },
        status: 200,
      })),
      delete: vi.fn(async () => ({ data: null, status: 204 })),
    },
  };
});

function renderContacts() {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/signers']}>
      <ContactsPage />
    </MemoryRouter>,
  );
}

describe('ContactsPage — add-signer dialog UX (regression)', () => {
  it('Bug B — pressing Enter inside the email field submits the dialog', async () => {
    renderContacts();
    await screen.findByText(/eliran azulay/i);

    await userEvent.click(screen.getByRole('button', { name: /^add signer$/i }));
    const dialog = screen.getByRole('dialog', { name: /^add signer$/i });
    // Query by accessible name (rule 4.6) — the TextField wires
    // <label htmlFor> so getByRole('textbox') resolves cleanly.
    const nameInput = within(dialog).getByRole('textbox', {
      name: /^name$/i,
    }) as HTMLInputElement;
    const emailInput = within(dialog).getByRole('textbox', {
      name: /^email$/i,
    }) as HTMLInputElement;

    await userEvent.type(nameInput, 'Keyboard Carla');
    await userEvent.type(emailInput, 'carla@example.com{Enter}');

    // Dialog should close and the new signer should appear in the table.
    expect(await screen.findByText(/keyboard carla/i)).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /^add signer$/i })).toBeNull();
  });

  it('Bug C — empty name submission shows the name-validation error against the name field', async () => {
    renderContacts();
    await screen.findByText(/eliran azulay/i);

    await userEvent.click(screen.getByRole('button', { name: /^add signer$/i }));
    const dialog = screen.getByRole('dialog', { name: /^add signer$/i });
    // Query by accessible name (rule 4.6) — the TextField wires
    // <label htmlFor> so getByRole('textbox') resolves cleanly.
    const nameInput = within(dialog).getByRole('textbox', {
      name: /^name$/i,
    }) as HTMLInputElement;
    const emailInput = within(dialog).getByRole('textbox', {
      name: /^email$/i,
    }) as HTMLInputElement;

    // Leave name blank, type a valid email, attempt to submit.
    await userEvent.type(emailInput, 'someone@example.com');
    await userEvent.click(within(dialog).getByRole('button', { name: /^add signer$/i }));

    // The "please enter a name" error must appear and must be associated
    // with the Name field via `aria-describedby`/`aria-errormessage`, not
    // attached to the email field where the user wasn't asked for input.
    const nameError = await within(dialog).findByText(/please enter a name/i);
    expect(nameError).toBeInTheDocument();

    // The Name input is the one in error — its aria-describedby points
    // at the same node as the rendered error message.
    const describedBy = nameInput.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(describedBy).toBe(nameError.getAttribute('id'));
  });
});
