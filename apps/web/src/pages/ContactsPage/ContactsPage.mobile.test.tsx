import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ContactsPage } from './ContactsPage';
import { renderWithProviders } from '../../test/renderWithProviders';

const backend = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
}));

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

function renderPhone() {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/signers']}>
      <Routes>
        <Route path="/signers" element={<ContactsPage />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  const mk = (id: string, name: string, email: string, docs: number) => ({
    id,
    owner_id: 't',
    name,
    email,
    color: '#F472B6',
    created_at: '',
    updated_at: '',
    docs_count: docs,
    last_sent_at: docs > 0 ? new Date().toISOString() : null,
  });
  backend.rows = [
    mk('c1', 'Hannah Wills', 'hannah@quill.vc', 4),
    mk('c2', 'Alex Reyes', 'alex@quill.vc', 3),
    mk('c3', 'Luis García', 'luis@acme.co', 0),
  ];
  window.localStorage.clear();
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ContactsPage — phone', () => {
  it('lists rows with the docs count and the header actions', async () => {
    renderPhone();
    expect(await screen.findByText('Hannah Wills')).toBeInTheDocument();
    expect(screen.getByText('4 docs')).toBeInTheDocument();
    expect(screen.getByText('0 docs')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add contacts' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Search contacts' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Select contacts' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('tapping a row opens a sheet with Send, Edit and Delete', async () => {
    const user = userEvent.setup();
    renderPhone();
    await user.click(await screen.findByRole('button', { name: /Alex Reyes/ }));
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Send' }));
    expect(screen.getByLabelText('location')).toHaveTextContent('/document/new?to=alex%40quill.vc');
  });

  it('the search icon swaps the header for a field that filters the list', async () => {
    const user = userEvent.setup();
    renderPhone();
    await screen.findByText('Hannah Wills');
    await user.click(screen.getByRole('button', { name: 'Search contacts' }));
    await user.type(screen.getByRole('searchbox'), 'luis');
    expect(screen.queryByText('Hannah Wills')).toBeNull();
    expect(screen.getByText('Luis García')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('Hannah Wills')).toBeInTheDocument();
  });

  it('select mode toggles rows and Delete N deletes at once with Undo', async () => {
    const user = userEvent.setup();
    renderPhone();
    await screen.findByText('Hannah Wills');
    await user.click(screen.getByRole('button', { name: 'Select contacts' }));
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /Hannah Wills/ }));
    await user.click(screen.getByRole('button', { name: /Luis García/ }));
    const bar = screen.getByRole('toolbar', { name: 'Selection actions' });
    await user.click(within(bar).getByRole('button', { name: 'Delete 2' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(await screen.findByText('2 contacts deleted')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(screen.queryByRole('toolbar', { name: 'Selection actions' })).toBeNull();
  });
});
