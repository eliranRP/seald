import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ContactsPage } from './ContactsPage';
import { renderWithProviders } from '../../test/renderWithProviders';

// Axios client is mocked so React-Query's `listContacts` resolves with the
// five fixture rows (mirroring the previous mock-API seed). Mutations echo
// their input so optimistic insert / delete settle cleanly.
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
    {
      id: 'c2',
      owner_id: 't',
      name: 'Nitsan Yanovitch',
      email: 'nitsan@yanov.co',
      color: '#7DD3FC',
      created_at: '',
      updated_at: '',
    },
    {
      id: 'c3',
      owner_id: 't',
      name: 'Ana Torres',
      email: 'ana@farrow.law',
      color: '#10B981',
      created_at: '',
      updated_at: '',
    },
    {
      id: 'c4',
      owner_id: 't',
      name: 'Meilin Chen',
      email: 'meilin@chen.co',
      color: '#F59E0B',
      created_at: '',
      updated_at: '',
    },
    {
      id: 'c5',
      owner_id: 't',
      name: 'Priya Kapoor',
      email: 'priya@kapoor.com',
      color: '#818CF8',
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
    // Eliran Azulay was the first seed contact — React-Query applies the
    // optimistic remove asynchronously.
    await waitFor(() => {
      expect(screen.queryByText(/eliran azulay/i)).toBeNull();
    });
  });
});
