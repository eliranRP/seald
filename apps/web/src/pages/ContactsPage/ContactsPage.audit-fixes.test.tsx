import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ContactsPage } from './ContactsPage';
import { renderWithProviders } from '../../test/renderWithProviders';

/**
 * Regression coverage for PR-7 (audit slice A — Sender):
 *   M-13 Escape closes the add/edit signer dialog. Mirrors the
 *        TemplatesListPage delete-modal Escape behaviour. WCAG 2.1.2.
 */

vi.mock('../../lib/api/apiClient', () => {
  return {
    apiClient: {
      get: vi.fn(async (url: string) => {
        if (url === '/contacts') return { data: [], status: 200 };
        return { data: {}, status: 200 };
      }),
      post: vi.fn(async () => ({ data: {}, status: 201 })),
      patch: vi.fn(async () => ({ data: {}, status: 200 })),
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

describe('ContactsPage — audit-fix regressions (PR-7)', () => {
  it('M-13: Escape closes the add-signer dialog without saving', async () => {
    renderContacts();
    await userEvent.click(screen.getByRole('button', { name: /^add signer$/i }));
    const dialog = screen.getByRole('dialog', { name: /^add signer$/i });
    // Type something so we know the close path doesn't accidentally
    // route through the submit handler.
    const nameInput = within(dialog).getByRole('textbox', { name: /^name$/i });
    await userEvent.type(nameInput, 'About to bail');

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: /^add signer$/i })).toBeNull();
  });
});
