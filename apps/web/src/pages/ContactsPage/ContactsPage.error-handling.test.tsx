import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ContactsPage } from './ContactsPage';
import { renderWithProviders } from '../../test/renderWithProviders';

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

describe('ContactsPage — mutation error surface (regression)', () => {
  it('keeps the add dialog open and surfaces an error when create fails (e.g. duplicate-email 409)', async () => {
    const apiClientModule = await import('../../lib/api/apiClient');
    const postSpy = vi.mocked(apiClientModule.apiClient.post);
    postSpy.mockRejectedValueOnce(
      Object.assign(new Error('Request failed with status code 409'), {
        isAxiosError: true,
        response: { status: 409, data: { error: 'email_taken' } },
      }),
    );

    renderContacts();
    await screen.findByText(/eliran azulay/i);

    await userEvent.click(screen.getByRole('button', { name: /^add signer$/i }));
    let dialog = screen.getByRole('dialog', { name: /^add signer$/i });
    const inputs = dialog.querySelectorAll('input');
    await userEvent.type(inputs[0] as HTMLInputElement, 'Eliran Dup');
    await userEvent.type(inputs[1] as HTMLInputElement, 'eliran@azulay.co');
    await userEvent.click(within(dialog).getByRole('button', { name: /^add signer$/i }));

    dialog = await screen.findByRole('dialog', { name: /^add signer$/i });
    expect(dialog).toBeInTheDocument();
    expect(
      await within(dialog).findByText(
        /already (in use|exists)|email.*taken|that email is already/i,
      ),
    ).toBeInTheDocument();
  });

  it('keeps the edit dialog open and surfaces an error when update fails (server error)', async () => {
    const apiClientModule = await import('../../lib/api/apiClient');
    const patchSpy = vi.mocked(apiClientModule.apiClient.patch);
    patchSpy.mockRejectedValueOnce(
      Object.assign(new Error('Request failed with status code 500'), {
        isAxiosError: true,
        response: { status: 500, data: { error: 'internal_error' } },
      }),
    );

    renderContacts();
    await screen.findByText(/eliran azulay/i);

    const editButtons = screen.getAllByRole('button', { name: /^edit /i });
    await userEvent.click(editButtons[0]!);
    let dialog = screen.getByRole('dialog', { name: /^edit signer$/i });
    const inputs = dialog.querySelectorAll('input');
    await userEvent.clear(inputs[0] as HTMLInputElement);
    await userEvent.type(inputs[0] as HTMLInputElement, 'Eliran Updated');
    await userEvent.click(within(dialog).getByRole('button', { name: /save changes/i }));

    dialog = await screen.findByRole('dialog', { name: /^edit signer$/i });
    expect(dialog).toBeInTheDocument();
    expect(
      await within(dialog).findByText(
        /could not save|something went wrong|please try again|failed to save/i,
      ),
    ).toBeInTheDocument();
  });

  it('accepts unicode in name + email when adding a contact', async () => {
    renderContacts();
    await screen.findByText(/eliran azulay/i);

    await userEvent.click(screen.getByRole('button', { name: /^add signer$/i }));
    const dialog = screen.getByRole('dialog', { name: /^add signer$/i });
    const inputs = dialog.querySelectorAll('input');
    const unicodeName = '李雷 Лев Толстой';
    const unicodeEmail = 'unicode@example.jp';
    await userEvent.type(inputs[0] as HTMLInputElement, unicodeName);
    await userEvent.type(inputs[1] as HTMLInputElement, unicodeEmail);
    await userEvent.click(within(dialog).getByRole('button', { name: /^add signer$/i }));

    expect(await screen.findByText(unicodeName)).toBeInTheDocument();
    expect(screen.getByText(unicodeEmail)).toBeInTheDocument();
  });
});
