import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ContactsPage } from './ContactsPage';
import { renderWithProviders } from '../../test/renderWithProviders';

interface Row {
  id: string;
  owner_id: string;
  name: string;
  email: string;
  color: string;
  created_at: string;
  updated_at: string;
  docs_count: number;
  last_sent_at: string | null;
}

const backend = vi.hoisted(() => ({
  rows: [] as Row[],
  trash: [] as Row[],
  failPatchWith: null as { status: number; error: string } | null,
  failDelete: false,
}));

function row(id: string, name: string, email: string): Row {
  return {
    id,
    owner_id: 't',
    name,
    email,
    color: '#F472B6',
    created_at: '',
    updated_at: '',
    docs_count: 0,
    last_sent_at: null,
  };
}

vi.mock('../../lib/api/apiClient', () => ({
  apiClient: {
    get: vi.fn(async (url: string) => {
      if (url === '/contacts') return { data: backend.rows, status: 200 };
      return { data: {}, status: 200 };
    }),
    post: vi.fn(async (url: string, body: { emails?: string[]; ids?: string[] }) => {
      if (url === '/contacts/bulk') {
        const created: Row[] = [];
        const skipped: string[] = [];
        const invalid: string[] = [];
        for (const email of body.emails ?? []) {
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) invalid.push(email);
          else if (backend.rows.some((r) => r.email === email)) skipped.push(email);
          else {
            const r = row(`new-${email}`, email.split('@')[0] ?? email, email);
            backend.rows = [...backend.rows, r];
            created.push(r);
          }
        }
        return {
          data: { created, skipped_duplicate: skipped, invalid },
          status: 200,
        };
      }
      if (url === '/contacts/restore') {
        const ids = body.ids ?? [];
        const back = backend.trash.filter((r) => ids.includes(r.id));
        backend.trash = backend.trash.filter((r) => !ids.includes(r.id));
        backend.rows = [...backend.rows, ...back];
        return { data: back, status: 200 };
      }
      return { data: {}, status: 200 };
    }),
    patch: vi.fn(async (url: string, body: Record<string, unknown>) => {
      if (backend.failPatchWith) {
        const { status, error } = backend.failPatchWith;
        throw Object.assign(new Error(`Request failed with status code ${String(status)}`), {
          isAxiosError: true,
          response: { status, data: { error } },
        });
      }
      const id = url.split('/').pop();
      backend.rows = backend.rows.map((r) => (r.id === id ? { ...r, ...body } : r));
      return { data: backend.rows.find((r) => r.id === id), status: 200 };
    }),
    delete: vi.fn(async (_url: string, cfg: { data: { ids: string[] } }) => {
      if (backend.failDelete) throw new Error('network');
      backend.trash = backend.rows.filter((r) => cfg.data.ids.includes(r.id));
      backend.rows = backend.rows.filter((r) => !cfg.data.ids.includes(r.id));
      return { data: { deleted: cfg.data.ids }, status: 200 };
    }),
  },
}));

function renderContacts() {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/signers']}>
      <ContactsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  backend.rows = [
    row('c1', 'Hannah Wills', 'hannah@quill.vc'),
    row('c2', 'Alex Reyes', 'alex@quill.vc'),
    row('c3', 'Maya Chen', 'maya@farow.co'),
  ];
  backend.trash = [];
  backend.failPatchWith = null;
  backend.failDelete = false;
  window.localStorage.clear();
});

describe('ContactsPage — add contacts', () => {
  it('splits a pasted list into chips, adds only the new ones and confirms with a toast', async () => {
    const user = userEvent.setup();
    renderContacts();
    await screen.findByText('Hannah Wills');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    const dialog = screen.getByRole('dialog', { name: 'Add contacts' });
    expect(within(dialog).getByText(/paste a whole list/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Add' })).toBeDisabled();

    await user.click(within(dialog).getByRole('textbox', { name: 'Emails' }));
    await user.paste('nora@acme.co, tom@acme.co kate@acme.co\nalex@quill.vc bad@@acme');
    expect(within(dialog).getByText('3 new · 1 already saved · 1 invalid')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Add 3' }));

    expect(await screen.findByText('3 contacts added')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Add contacts' })).toBeNull();
    expect(await screen.findByText('nora@acme.co')).toBeInTheDocument();
    expect(screen.getByText('kate@acme.co')).toBeInTheDocument();
  });

  it('adds a single typed address without pressing Enter first', async () => {
    const user = userEvent.setup();
    renderContacts();
    await screen.findByText('Hannah Wills');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    const dialog = screen.getByRole('dialog', { name: 'Add contacts' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Emails' }), 'solo@acme.co');
    await user.click(within(dialog).getByRole('button', { name: 'Add 1' }));
    expect(await screen.findByText('Contact added')).toBeInTheDocument();
  });

  it('Cancel and Escape close the dialog without adding', async () => {
    const user = userEvent.setup();
    renderContacts();
    await screen.findByText('Hannah Wills');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.type(screen.getByRole('textbox', { name: 'Emails' }), 'about@bail.co ');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Add contacts' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.queryByText('about@bail.co')).toBeNull();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(backend.rows).toHaveLength(3);
  });
});

describe('ContactsPage — edit', () => {
  async function openEdit(user: ReturnType<typeof userEvent.setup>, name: string) {
    await user.click(await screen.findByRole('button', { name: `More for ${name}` }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));
    return screen.getByRole('dialog', { name: 'Edit contact' });
  }

  it('saves a new name and shows it in the list', async () => {
    const user = userEvent.setup();
    renderContacts();
    const dialog = await openEdit(user, 'Alex Reyes');
    const name = within(dialog).getByRole('textbox', { name: 'Name' });
    expect(name).toHaveValue('Alex Reyes');
    await user.clear(name);
    await user.type(name, 'Alexandra Reyes');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Alexandra Reyes')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Edit contact' })).toBeNull();
  });

  it('names the contact that already uses the email and blocks the save', async () => {
    const user = userEvent.setup();
    renderContacts();
    const dialog = await openEdit(user, 'Alex Reyes');
    const email = within(dialog).getByRole('textbox', { name: 'Email' });
    await user.clear(email);
    await user.type(email, 'Maya@farow.co');
    expect(within(dialog).getByText('Maya Chen already uses this email')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(backend.rows.find((r) => r.id === 'c2')?.email).toBe('alex@quill.vc');
  });

  it('keeps the dialog open with the email error when the server answers 409', async () => {
    const user = userEvent.setup();
    backend.failPatchWith = { status: 409, error: 'email_taken' };
    renderContacts();
    const dialog = await openEdit(user, 'Alex Reyes');
    const email = within(dialog).getByRole('textbox', { name: 'Email' });
    await user.clear(email);
    await user.type(email, 'free@quill.vc');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(
      await within(dialog).findByText('That email is already in use by another contact.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Edit contact' })).toBeInTheDocument();
  });

  it('keeps the dialog open with a retry message on any other server error', async () => {
    const user = userEvent.setup();
    backend.failPatchWith = { status: 500, error: 'internal_error' };
    renderContacts();
    const dialog = await openEdit(user, 'Alex Reyes');
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), ' Jr');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText(/could not save this contact/i)).toBeInTheDocument();
  });

  it('validates an empty name and a bad email before calling the server', async () => {
    const user = userEvent.setup();
    renderContacts();
    const dialog = await openEdit(user, 'Alex Reyes');
    await user.clear(within(dialog).getByRole('textbox', { name: 'Name' }));
    const email = within(dialog).getByRole('textbox', { name: 'Email' });
    await user.clear(email);
    await user.type(email, 'nope{Enter}');
    expect(within(dialog).getByText('Enter a name.')).toBeInTheDocument();
    expect(within(dialog).getByText('Enter a valid email address.')).toBeInTheDocument();
  });
});

describe('ContactsPage — delete and undo', () => {
  it('confirms a single delete, removes the row and Undo brings it back', async () => {
    const user = userEvent.setup();
    renderContacts();
    await user.click(await screen.findByRole('button', { name: 'More for Alex Reyes' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Delete Alex Reyes?' });
    expect(within(dialog).getByText('They stay on sent documents.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.queryByText('Alex Reyes')).toBeNull());
    const toast = await screen.findByText('Contact deleted');
    expect(toast).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByText('Alex Reyes')).toBeInTheDocument();
  });

  it('keeps the contact when the confirm is cancelled', async () => {
    const user = userEvent.setup();
    renderContacts();
    await user.click(await screen.findByRole('button', { name: 'More for Alex Reyes' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Keep' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByText('Alex Reyes')).toBeInTheDocument();
    expect(backend.rows).toHaveLength(3);
  });

  it('deletes the selected contacts together from the bulk bar', async () => {
    const user = userEvent.setup();
    renderContacts();
    await screen.findByText('Hannah Wills');
    await user.click(screen.getByRole('checkbox', { name: 'Select Hannah Wills' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Maya Chen' }));
    await user.click(screen.getByRole('button', { name: 'Delete 2' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Delete 2 contacts?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete 2' }));
    expect(await screen.findByText('2 contacts deleted')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Hannah Wills')).toBeNull());
    expect(screen.queryByText('Maya Chen')).toBeNull();
    expect(screen.getByText('Alex Reyes')).toBeInTheDocument();
    expect(screen.queryByRole('toolbar', { name: 'Bulk actions' })).toBeNull();
  });

  it('puts the row back and says so when the server refuses the delete', async () => {
    const user = userEvent.setup();
    backend.failDelete = true;
    renderContacts();
    await user.click(await screen.findByRole('button', { name: 'More for Alex Reyes' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
    );
    expect(await screen.findByText('Could not delete. Try again.')).toBeInTheDocument();
    expect(await screen.findByText('Alex Reyes')).toBeInTheDocument();
  });
});
