import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
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

const backend = vi.hoisted(() => ({ rows: [] as Row[] }));

function seed(): Row[] {
  const hoursAgo = (h: number): string => new Date(Date.now() - h * 3_600_000).toISOString();
  const mk = (id: string, name: string, email: string, docs: number, sent: string | null): Row => ({
    id,
    owner_id: 't',
    name,
    email,
    color: '#F472B6',
    created_at: '',
    updated_at: '',
    docs_count: docs,
    last_sent_at: sent,
  });
  return [
    mk('c1', 'Hannah Wills', 'hannah@quill.vc', 4, hoursAgo(2)),
    mk('c2', 'Alex Reyes', 'alex@quill.vc', 3, hoursAgo(5 * 24)),
    mk('c3', 'Maya Chen', 'maya@farow.co', 6, hoursAgo(24)),
    mk('c4', 'Luis García', 'luis@acme.co', 0, null),
    mk('c5', 'Dana Kim', 'dana@northwind.io', 1, hoursAgo(90 * 24)),
  ];
}

vi.mock('../../lib/api/apiClient', () => ({
  apiClient: {
    get: vi.fn(async (url: string) => {
      if (url === '/contacts') return { data: backend.rows, status: 200 };
      return { data: {}, status: 200 };
    }),
    post: vi.fn(async () => ({ data: {}, status: 200 })),
    patch: vi.fn(async () => ({ data: {}, status: 200 })),
    delete: vi.fn(async () => ({ data: null, status: 200 })),
  },
}));

function LocationProbe() {
  const loc = useLocation();
  return <output aria-label="location">{`${loc.pathname}${loc.search}`}</output>;
}

function renderContacts() {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/signers']}>
      <Routes>
        <Route path="/signers" element={<ContactsPage />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

const names = (): string[] =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((r) => within(r).getAllByRole('cell')[1]?.lastElementChild?.textContent ?? '');

beforeEach(() => {
  backend.rows = seed();
  window.localStorage.clear();
});

describe('ContactsPage — list', () => {
  it('shows the title, the count and one row per contact, newest send first', async () => {
    renderContacts();
    expect(await screen.findByText('Hannah Wills')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Contacts', level: 1 })).toBeInTheDocument();
    expect(screen.getByLabelText('5 contacts')).toBeInTheDocument();
    // Last sent: Hannah 2h, Maya 1d, Alex 5d, Dana 90d, then Luis who never got one.
    expect(names()).toEqual(['Hannah Wills', 'Maya Chen', 'Alex Reyes', 'Dana Kim', 'Luis García']);
  });

  it('shows documents and last sent per row, "never" when nothing was sent', async () => {
    renderContacts();
    const hannah = (await screen.findByText('Hannah Wills')).closest('[role="row"]') as HTMLElement;
    expect(within(hannah).getByText('hannah@quill.vc')).toBeInTheDocument();
    expect(within(hannah).getByRole('link', { name: '4 documents' })).toBeInTheDocument();
    expect(within(hannah).getByText('2h ago')).toBeInTheDocument();
    const luis = screen.getByText('Luis García').closest('[role="row"]') as HTMLElement;
    expect(within(luis).getByText('0 documents')).toBeInTheDocument();
    expect(within(luis).queryByRole('link')).toBeNull();
    expect(within(luis).getByText('never')).toBeInTheDocument();
    const dana = screen.getByText('Dana Kim').closest('[role="row"]') as HTMLElement;
    expect(within(dana).getByRole('link', { name: '1 document' })).toBeInTheDocument();
  });

  it('the documents count opens the Documents list filtered to that person', async () => {
    const user = userEvent.setup();
    renderContacts();
    await user.click(await screen.findByRole('link', { name: '4 documents' }));
    expect(screen.getByLabelText('location')).toHaveTextContent(
      '/documents?signer=hannah%40quill.vc',
    );
  });

  it('Send opens a new document with the person pre-added', async () => {
    const user = userEvent.setup();
    renderContacts();
    await user.click(await screen.findByRole('button', { name: 'Send to Alex Reyes' }));
    expect(screen.getByLabelText('location')).toHaveTextContent('/document/new?to=alex%40quill.vc');
  });
});

describe('ContactsPage — search and sort', () => {
  it('filters rows live by name or email and says how many matched', async () => {
    const user = userEvent.setup();
    renderContacts();
    await screen.findByText('Hannah Wills');
    await user.type(screen.getByRole('searchbox'), 'quill');
    expect(names()).toEqual(['Hannah Wills', 'Alex Reyes']);
    expect(screen.getByText('2 results')).toBeInTheDocument();
    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), 'LUIS');
    expect(names()).toEqual(['Luis García']);
    expect(screen.getByText('1 result')).toBeInTheDocument();
  });

  it('shows "No matches" with a way back when nothing matches', async () => {
    const user = userEvent.setup();
    renderContacts();
    await screen.findByText('Hannah Wills');
    await user.type(screen.getByRole('searchbox'), 'zzz');
    expect(screen.getByText('No matches')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(names()).toHaveLength(5);
  });

  it('sorts by name and remembers the choice', async () => {
    const user = userEvent.setup();
    const first = renderContacts();
    await screen.findByText('Hannah Wills');
    await user.click(screen.getByRole('button', { name: 'Sort: Last sent' }));
    expect(names()).toEqual(['Alex Reyes', 'Dana Kim', 'Hannah Wills', 'Luis García', 'Maya Chen']);
    expect(window.localStorage.getItem('seald.contacts.sort')).toBe('name');
    first.unmount();
    renderContacts();
    await screen.findByText('Hannah Wills');
    expect(screen.getByRole('button', { name: 'Sort: Name' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sort: Name' }));
    expect(names()[0]).toBe('Hannah Wills');
  });
});

describe('ContactsPage — states', () => {
  it('shows skeleton rows while the list is loading', () => {
    backend.rows = [];
    renderContacts();
    expect(screen.getByRole('table', { name: 'Contacts' })).toHaveAttribute('aria-busy', 'true');
  });

  it('shows the empty state with an Add contacts action', async () => {
    backend.rows = [];
    renderContacts();
    expect(
      await screen.findByText('No contacts yet', undefined, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add contacts' })).toBeInTheDocument();
  });
});

describe('ContactsPage — selection', () => {
  it('selecting rows shows the bulk bar; Clear and Escape empty it', async () => {
    const user = userEvent.setup();
    renderContacts();
    await screen.findByText('Hannah Wills');
    await user.click(screen.getByRole('checkbox', { name: 'Select Hannah Wills' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Maya Chen' }));
    const bar = screen.getByRole('toolbar', { name: 'Bulk actions' });
    expect(within(bar).getByText('2 selected')).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Delete 2' })).toBeInTheDocument();
    await user.click(within(bar).getByRole('button', { name: 'Clear' }));
    expect(screen.queryByRole('toolbar', { name: 'Bulk actions' })).toBeNull();

    await user.click(screen.getByRole('checkbox', { name: 'Select Hannah Wills' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('toolbar', { name: 'Bulk actions' })).toBeNull();
  });

  it('the header checkbox selects every visible row, and only those', async () => {
    const user = userEvent.setup();
    renderContacts();
    await screen.findByText('Hannah Wills');
    await user.type(screen.getByRole('searchbox'), 'quill');
    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: 'Select all' })).toBeChecked();
    });
  });
});
