import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { renderWithProviders } from '@/test/renderWithProviders';
import { getTemplates, setTemplates } from './templates';
import type { ResolvedField, TemplateSummary } from './templates';
import { UseTemplateDialog } from './UseTemplateDialog';

const HANNAH_ID = 'a1111111-1111-4111-8111-111111111111';
const ALEX_ID = 'b2222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  reset: vi.fn(),
  readPdfInfo: vi.fn(),
  applyTemplate: vi.fn(),
  bumpUseCount: vi.fn(),
  updateTemplate: vi.fn(),
  fetchExample: vi.fn(),
  connect: vi.fn(),
  accounts: { data: [] as Array<{ id: string }> },
}));

vi.mock('@/features/envelopes', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('@/features/envelopes')),
  useSendEnvelope: () => ({ phase: 'idle', error: null, run: mocks.run, reset: mocks.reset }),
}));
vi.mock('@/lib/pdf', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('@/lib/pdf')),
  readPdfInfo: mocks.readPdfInfo,
}));
vi.mock('./templatesApi', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('./templatesApi')),
  applyTemplate: mocks.applyTemplate,
  bumpUseCount: mocks.bumpUseCount,
  updateTemplate: mocks.updateTemplate,
  fetchTemplateExamplePdf: mocks.fetchExample,
}));
vi.mock('@/routes/settings/integrations/useGDriveAccounts', () => ({
  useGDriveAccounts: () => ({ data: mocks.accounts.data, isLoading: false, isError: false }),
  GDRIVE_ACCOUNTS_KEY: ['integrations', 'gdrive', 'accounts'],
  useConnectGDrive: () => ({ mutate: mocks.connect }),
  useReconnectGDrive: () => ({ mutate: vi.fn() }),
  useDisconnectGDrive: vi.fn(),
  useGDriveOAuthMessageListener: vi.fn(),
}));
vi.mock('@/lib/api/apiClient', () => ({
  apiClient: {
    get: vi.fn(async (url: string) => {
      if (url === '/contacts') {
        return {
          data: [
            row(HANNAH_ID, 'Hannah Wills', 'hannah@quill.vc'),
            row(ALEX_ID, 'Alex Reyes', 'alex@quill.vc'),
          ],
          status: 200,
        };
      }
      return { data: [], status: 200 };
    }),
    post: vi.fn(async (_url: string, body: { name?: string; email?: string }) => ({
      data: row('c-new', body.name ?? '', body.email ?? ''),
      status: 201,
    })),
    patch: vi.fn(async () => ({ data: {}, status: 200 })),
    delete: vi.fn(async () => ({ data: null, status: 200 })),
  },
}));

function row(id: string, name: string, email: string) {
  return {
    id,
    owner_id: 't',
    name,
    email,
    color: '#7DD3FC',
    created_at: '',
    updated_at: '',
  };
}

const TEMPLATE: TemplateSummary = {
  id: 'tpl-1',
  name: 'NDA — standard',
  pages: 3,
  fieldCount: 3,
  lastUsed: '',
  lastUsedAt: null,
  uses: 0,
  cover: '',
  exampleFile: '',
  hasExamplePdf: true,
  fields: [
    { type: 'signature', pageRule: 'last', x: 56, y: 130, signerRoleId: HANNAH_ID },
    { type: 'signature', pageRule: 'last', x: 56, y: 260, signerRoleId: 'me:test-user' },
  ],
  lastSigners: [
    { id: HANNAH_ID, name: 'Hannah Wills', email: 'hannah@quill.vc', color: '#7DD3FC' },
    { id: 'me:test-user', name: 'Jamie Okonkwo', email: 'jamie@seald.app', color: '#F472B6' },
  ],
};

const FIELDS: ReadonlyArray<ResolvedField> = [
  { id: 'f1', page: 3, type: 'signature', x: 56, y: 130, signerRoleId: HANNAH_ID },
  { id: 'f2', page: 3, type: 'signature', x: 56, y: 260, signerRoleId: 'me:test-user' },
];

function LocationProbe() {
  const loc = useLocation();
  return (
    <output aria-label="location">
      {`${loc.pathname}${loc.search}`}
      <span data-testid="state">{JSON.stringify(loc.state)}</span>
    </output>
  );
}

function renderDialog(template: TemplateSummary | null = TEMPLATE, onClose = vi.fn()) {
  const utils = renderWithProviders(
    <MemoryRouter initialEntries={['/templates']}>
      <Routes>
        <Route
          path="/templates"
          element={<UseTemplateDialog template={template} onClose={onClose} />}
        />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
  return { ...utils, onClose };
}

const pdf = (name = 'new.pdf') => new File(['%PDF-1.4'], name, { type: 'application/pdf' });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.accounts.data = [];
  mocks.readPdfInfo.mockResolvedValue({ pages: 3, aspect: 1.294 });
  mocks.fetchExample.mockResolvedValue(new Blob(['%PDF-1.4'], { type: 'application/pdf' }));
  mocks.applyTemplate.mockResolvedValue(FIELDS);
  mocks.run.mockResolvedValue({ envelope_id: 'env-1', short_code: 'ABC' });
  mocks.bumpUseCount.mockImplementation(async () => ({ ...TEMPLATE, uses: 1 }));
  mocks.updateTemplate.mockImplementation(async () => ({ ...TEMPLATE, uses: 1 }));
  setTemplates([TEMPLATE]);
});

async function ready() {
  const dialog = await screen.findByRole('dialog', { name: 'Use NDA — standard' });
  await within(dialog).findByText('NDA — standard.pdf');
  return dialog;
}

describe('UseTemplateDialog — open state', () => {
  it('renders nothing without a template', () => {
    renderDialog(null);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows a row per role with last time’s people, the saved PDF and the defaults line', async () => {
    renderDialog();
    const dialog = await ready();
    const first = within(dialog).getByRole('button', { name: 'Person for Signer 1' });
    expect(within(first).getByText('Hannah Wills')).toBeInTheDocument();
    const second = within(dialog).getByRole('button', { name: 'Person for Signer 2' });
    expect(within(second).getByText('Jamie Okonkwo')).toBeInTheDocument();
    expect(within(second).getByText('Your account')).toBeInTheDocument();
    expect(within(dialog).getByText('3 pages')).toBeInTheDocument();
    expect(
      within(dialog).getByText('Reminders every 3 days · expires in 30 days'),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Send now' })).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: 'Review fields' })).toBeEnabled();
  });

  it('Send now waits for the saved document, which loads first', async () => {
    let release: (b: Blob) => void = () => undefined;
    mocks.fetchExample.mockReturnValueOnce(new Promise<Blob>((r) => (release = r)));
    renderDialog();
    const dialog = await screen.findByRole('dialog', { name: 'Use NDA — standard' });
    expect(within(dialog).getByRole('button', { name: 'Send now' })).toBeDisabled();
    expect(within(dialog).getByLabelText('Loading the saved document')).toBeInTheDocument();
    release(new Blob(['%PDF-1.4'], { type: 'application/pdf' }));
    await within(dialog).findByText('NDA — standard.pdf');
    expect(within(dialog).getByRole('button', { name: 'Send now' })).toBeEnabled();
  });
});

describe('UseTemplateDialog — people', () => {
  it('Send now is disabled with a hint until every role has a person', async () => {
    const user = userEvent.setup();
    const noMemory: TemplateSummary = { ...TEMPLATE, lastSigners: [], fields: [] };
    setTemplates([noMemory]);
    renderDialog(noMemory);
    const dialog = await ready();
    expect(within(dialog).getByText('Choose a person')).toBeInTheDocument();
    expect(within(dialog).getByText('Pick a person for every role')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Send now' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Person for Signer 1' }));
    await user.click(within(dialog).getByRole('option', { name: /Alex Reyes/ }));
    expect(within(dialog).queryByText('Pick a person for every role')).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Send now' })).toBeEnabled();
  });

  it('does not let one person fill two roles', async () => {
    const user = userEvent.setup();
    renderDialog();
    const dialog = await ready();
    await user.click(within(dialog).getByRole('button', { name: 'Person for Signer 2' }));
    // Hannah already fills Signer 1, so she can't be picked here.
    expect(within(dialog).getByRole('option', { name: /Hannah Wills/ })).toBeDisabled();
  });

  it('adds a new person by email as a contact and picks them', async () => {
    const user = userEvent.setup();
    renderDialog();
    const dialog = await ready();
    await user.click(within(dialog).getByRole('button', { name: 'Person for Signer 1' }));
    await user.click(within(dialog).getByRole('button', { name: 'New email' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'New email' }), 'nora@acme.co');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    const trigger = within(dialog).getByRole('button', { name: 'Person for Signer 1' });
    await waitFor(() => expect(within(trigger).getByText('nora@acme.co')).toBeInTheDocument());
  });
});

describe('UseTemplateDialog — Send now', () => {
  it('creates and sends from the template, remembers the use, and lands on Documents', async () => {
    const user = userEvent.setup();
    renderDialog();
    const dialog = await ready();
    await user.click(within(dialog).getByRole('button', { name: 'Send now' }));

    await waitFor(() => expect(mocks.run).toHaveBeenCalledTimes(1));
    expect(mocks.applyTemplate).toHaveBeenCalledWith('tpl-1', 3);
    const input = mocks.run.mock.calls[0]![0] as {
      title: string;
      file: File;
      signers: unknown[];
      remindersEnabled: boolean;
      buildFields: (
        m: Map<string, string>,
        d: Map<string, string>,
      ) => Array<Record<string, unknown>>;
    };
    expect(input.title).toBe('NDA — standard');
    expect(input.file.name).toBe('NDA — standard.pdf');
    expect(input.remindersEnabled).toBe(true);
    expect(input.signers).toEqual([
      { localId: HANNAH_ID, contactId: HANNAH_ID },
      {
        localId: 'me:test-user',
        email: 'jamie@seald.app',
        name: 'Jamie Okonkwo',
        color: expect.any(String),
      },
    ]);
    const fields = input.buildFields(
      new Map([
        [HANNAH_ID, 's1'],
        ['me:test-user', 's2'],
      ]),
      new Map(),
    );
    expect(fields.map((f) => f['signer_id'])).toEqual(['s1', 's2']);

    await waitFor(() => expect(screen.getByLabelText('location')).toHaveTextContent('/documents'));
    expect(screen.getByTestId('state')).toHaveTextContent('"justSent":"env-1"');
    await waitFor(() => expect(mocks.bumpUseCount).toHaveBeenCalledWith('tpl-1'));
    // Same people as last time: nothing else to save.
    expect(mocks.updateTemplate).not.toHaveBeenCalled();
    await waitFor(() => expect(getTemplates()[0]?.uses).toBe(1));
  });

  it('remembers a changed person in the template (fields move with the slot)', async () => {
    const user = userEvent.setup();
    renderDialog();
    const dialog = await ready();
    await user.click(within(dialog).getByRole('button', { name: 'Person for Signer 1' }));
    await user.click(within(dialog).getByRole('option', { name: /Alex Reyes/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Send now' }));
    await waitFor(() => expect(mocks.updateTemplate).toHaveBeenCalledTimes(1));
    const [id, patch] = mocks.updateTemplate.mock.calls[0]! as [
      string,
      { last_signers: Array<{ id: string }>; field_layout: Array<{ signerRoleId?: string }> },
    ];
    expect(id).toBe('tpl-1');
    expect(patch.last_signers.map((s) => s.id)).toEqual([ALEX_ID, 'me:test-user']);
    expect(patch.field_layout.map((f) => f.signerRoleId)).toEqual([ALEX_ID, 'me:test-user']);
  });

  it('shows an error and stays open when the send fails', async () => {
    const user = userEvent.setup();
    mocks.run.mockRejectedValueOnce(new Error('boom'));
    renderDialog();
    const dialog = await ready();
    await user.click(within(dialog).getByRole('button', { name: 'Send now' }));
    expect(await within(dialog).findByText(/could not send/i)).toBeInTheDocument();
    expect(mocks.reset).toHaveBeenCalled();
    expect(within(dialog).getByRole('button', { name: 'Send now' })).toBeEnabled();
    expect(mocks.bumpUseCount).not.toHaveBeenCalled();
  });

  it('falls back to expanding the layout locally when the apply request fails', async () => {
    const user = userEvent.setup();
    mocks.applyTemplate.mockRejectedValueOnce(new Error('offline'));
    renderDialog();
    const dialog = await ready();
    await user.click(within(dialog).getByRole('button', { name: 'Send now' }));
    await waitFor(() => expect(mocks.run).toHaveBeenCalled());
  });
});

describe('UseTemplateDialog — Review fields', () => {
  it('opens the editor with the people chosen and the layout already bound to them', async () => {
    const user = userEvent.setup();
    renderDialog();
    const dialog = await ready();
    await user.click(within(dialog).getByRole('button', { name: 'Person for Signer 1' }));
    await user.click(within(dialog).getByRole('option', { name: /Alex Reyes/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Review fields' }));
    await waitFor(() =>
      expect(screen.getByLabelText('location')).toHaveTextContent('/templates/tpl-1/edit'),
    );
    const state = JSON.parse(screen.getByTestId('state').textContent ?? '{}') as {
      templateSigners: Array<{ id: string }>;
      templateFields: Array<{ signerRoleId: string }>;
      templateFieldsPages: number;
      pendingFile?: unknown;
    };
    expect(state.templateSigners.map((s) => s.id)).toEqual([ALEX_ID, 'me:test-user']);
    expect(state.templateFields.map((f) => f.signerRoleId)).toEqual([ALEX_ID, 'me:test-user']);
    expect(state.templateFieldsPages).toBe(3);
    expect(mocks.run).not.toHaveBeenCalled();
  });
});

describe('UseTemplateDialog — document', () => {
  it('Replace shows a drop area; choosing a PDF swaps the document', async () => {
    const user = userEvent.setup();
    mocks.readPdfInfo.mockResolvedValueOnce({ pages: 3, aspect: 1.294 });
    renderDialog();
    const dialog = await ready();
    await user.click(within(dialog).getByRole('button', { name: 'Replace' }));
    expect(within(dialog).getByText('Drop a PDF · the layout snaps on')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Keep current' })).toBeInTheDocument();
    mocks.readPdfInfo.mockResolvedValueOnce({ pages: 5, aspect: 1.4 });
    fireEvent.change(within(dialog).getByLabelText('Choose a PDF'), {
      target: { files: [pdf('Contract v2.pdf')] },
    });
    expect(await within(dialog).findByText('Contract v2.pdf')).toBeInTheDocument();
    expect(within(dialog).getByText('5 pages')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Send now' }));
    await waitFor(() => expect(mocks.run).toHaveBeenCalled());
    expect(mocks.applyTemplate).toHaveBeenCalledWith('tpl-1', 5);
    expect((mocks.run.mock.calls[0]![0] as { file: File }).file.name).toBe('Contract v2.pdf');
  });

  it('Keep current goes back to the saved document', async () => {
    const user = userEvent.setup();
    renderDialog();
    const dialog = await ready();
    await user.click(within(dialog).getByRole('button', { name: 'Replace' }));
    await user.click(within(dialog).getByRole('button', { name: 'Keep current' }));
    expect(within(dialog).getByText('NDA — standard.pdf')).toBeInTheDocument();
  });

  it('a PDF with fewer pages than the layout needs warns and holds Send now', async () => {
    const user = userEvent.setup();
    const paged: TemplateSummary = {
      ...TEMPLATE,
      fields: [
        { type: 'signature', pageRule: 4, x: 1, y: 1, signerRoleId: HANNAH_ID },
        { type: 'signature', pageRule: 'last', x: 1, y: 1, signerRoleId: 'me:test-user' },
      ],
    };
    setTemplates([paged]);
    renderDialog(paged);
    const dialog = await ready();
    await user.click(within(dialog).getByRole('button', { name: 'Replace' }));
    mocks.readPdfInfo.mockResolvedValueOnce({ pages: 2, aspect: 1.3 });
    fireEvent.change(within(dialog).getByLabelText('Choose a PDF'), {
      target: { files: [pdf()] },
    });
    expect(
      await within(dialog).findByText(/1 field on missing pages would be dropped/),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Send now' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Review fields' })).toBeEnabled();
  });

  it('rejects a file that is not a PDF', async () => {
    const user = userEvent.setup();
    renderDialog();
    const dialog = await ready();
    await user.click(within(dialog).getByRole('button', { name: 'Replace' }));
    fireEvent.change(within(dialog).getByLabelText('Choose a PDF'), {
      target: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] },
    });
    expect(await within(dialog).findByText('Choose a PDF up to 25 MB.')).toBeInTheDocument();
  });

  it('says so when a PDF cannot be read', async () => {
    const user = userEvent.setup();
    renderDialog();
    const dialog = await ready();
    await user.click(within(dialog).getByRole('button', { name: 'Replace' }));
    mocks.readPdfInfo.mockRejectedValueOnce(new Error('bad pdf'));
    fireEvent.change(within(dialog).getByLabelText('Choose a PDF'), {
      target: { files: [pdf()] },
    });
    expect(await within(dialog).findByText(/could not be read/i)).toBeInTheDocument();
  });

  it('a template without a saved PDF starts on the drop area with Send now held', async () => {
    const bare: TemplateSummary = { ...TEMPLATE, hasExamplePdf: false };
    setTemplates([bare]);
    renderDialog(bare);
    const dialog = await screen.findByRole('dialog', { name: 'Use NDA — standard' });
    expect(within(dialog).getByText('Drop a PDF · the layout snaps on')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Keep current' })).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Send now' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Review fields' })).toBeDisabled();
    expect(mocks.fetchExample).not.toHaveBeenCalled();
  });

  it('a saved PDF that cannot be loaded falls back to the drop area with a note', async () => {
    mocks.fetchExample.mockRejectedValueOnce(new Error('404'));
    renderDialog();
    const dialog = await screen.findByRole('dialog', { name: 'Use NDA — standard' });
    expect(
      await within(dialog).findByText(/saved document could not be loaded/i),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Drop a PDF · the layout snaps on')).toBeInTheDocument();
  });
});

type FlagHost = { __SEALD_FEATURE_OVERRIDES__?: Record<string, boolean> };

describe('UseTemplateDialog — Google Drive', () => {
  afterEach(() => {
    delete (globalThis as unknown as FlagHost).__SEALD_FEATURE_OVERRIDES__;
  });

  it('offers Connect Google Drive when the flag is on and no account is connected', async () => {
    const user = userEvent.setup();
    (globalThis as unknown as FlagHost).__SEALD_FEATURE_OVERRIDES__ = { gdriveIntegration: true };
    renderDialog();
    const dialog = await ready();
    await user.click(within(dialog).getByRole('button', { name: 'Replace' }));
    await user.click(within(dialog).getByRole('button', { name: /connect google drive/i }));
    expect(mocks.connect).toHaveBeenCalledTimes(1);
  });

  it('offers Pick from Google Drive when an account is connected', async () => {
    const user = userEvent.setup();
    (globalThis as unknown as FlagHost).__SEALD_FEATURE_OVERRIDES__ = { gdriveIntegration: true };
    mocks.accounts.data = [{ id: 'acct-1' }];
    renderDialog();
    const dialog = await ready();
    await user.click(within(dialog).getByRole('button', { name: 'Replace' }));
    expect(within(dialog).getByRole('button', { name: /pick from google drive/i })).toBeEnabled();
  });

  it('has no Drive button while the flag is off', async () => {
    const user = userEvent.setup();
    (globalThis as unknown as FlagHost).__SEALD_FEATURE_OVERRIDES__ = { gdriveIntegration: false };
    renderDialog();
    const dialog = await ready();
    await user.click(within(dialog).getByRole('button', { name: 'Replace' }));
    expect(within(dialog).queryByRole('button', { name: /google drive/i })).toBeNull();
  });
});

describe('UseTemplateDialog — closing', () => {
  it('the close button asks the host to close', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();
    const dialog = await ready();
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
