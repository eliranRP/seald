import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import * as sharedModule from 'shared';
import { SAMPLE_TEMPLATES as TEMPLATES } from '@/test/templateFixtures';
import { renderWithProviders } from '@/test/renderWithProviders';
import { getTemplates, setTemplates as publishTemplates } from '@/features/templates';
import type { TemplateSummary } from '@/features/templates';
import * as templatesApi from '@/features/templates/templatesApi';
import { TemplatesListPage } from './TemplatesListPage';

vi.mock('@/lib/pdf', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('@/lib/pdf')),
  readPdfInfo: vi.fn().mockResolvedValue({ pages: 3, aspect: 1.294 }),
}));

function LocationProbe() {
  const loc = useLocation();
  return <output aria-label="location">{`${loc.pathname}${loc.search}`}</output>;
}

const [NDA, MSA, ICA, RELEASE] = TEMPLATES as [
  TemplateSummary,
  TemplateSummary,
  TemplateSummary,
  TemplateSummary,
  ...TemplateSummary[],
];

const TAGGED: ReadonlyArray<TemplateSummary> = [
  { ...NDA, tags: ['Legal'] },
  { ...MSA, tags: ['HR'] },
  { ...ICA, tags: ['HR'] },
  { ...RELEASE, tags: ['Sales'] },
];

function renderPage(initial: ReadonlyArray<TemplateSummary> = TAGGED, path = '/templates') {
  return renderWithProviders(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/templates" element={<TemplatesListPage initialTemplates={initial} />} />
        <Route
          path="/templates/:id/use"
          element={<TemplatesListPage initialTemplates={initial} />}
        />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

const cardNames = (): string[] =>
  screen
    .getAllByRole('button')
    .filter((b) => b.hasAttribute('aria-describedby') && !b.hasAttribute('aria-haspopup'))
    .map((b) => b.getAttribute('aria-labelledby'))
    .map((id) => (id ? (document.getElementById(id)?.textContent ?? '') : ''));

beforeEach(() => {
  publishTemplates([]);
});
afterEach(() => {
  vi.restoreAllMocks();
  publishTemplates([]);
});

describe('TemplatesListPage — list', () => {
  it('shows the title, the count and one card per template', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Templates', level: 1 })).toBeInTheDocument();
    expect(screen.getByLabelText('4 templates')).toBeInTheDocument();
    expect(cardNames()).toEqual(TAGGED.map((t) => t.name));
    expect(screen.queryByRole('checkbox', { name: /group by tag/i })).toBeNull();
  });

  it('"New template" opens the new-template flow', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'New template' }));
    expect(screen.getByLabelText('location')).toHaveTextContent('/templates/new');
  });

  it('clicking a card opens its Use dialog', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: NDA.name }));
    expect(await screen.findByRole('dialog', { name: `Use ${NDA.name}` })).toBeInTheDocument();
  });
});

describe('TemplatesListPage — search and tags', () => {
  it('search filters by name, case-insensitively, and says how many matched', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByRole('searchbox', { name: 'Search templates' }), 'WAIVER');
    expect(cardNames()).toEqual([NDA.name]);
    expect(screen.getByText('1 result')).toBeInTheDocument();
  });

  it('shows "No matches" with a way to clear the search', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByRole('searchbox', { name: 'Search templates' }), 'zzz');
    expect(screen.getByText('No matches')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(cardNames()).toHaveLength(4);
  });

  it('tag pills: All plus every tag, one active at a time, click again to reset', async () => {
    const user = userEvent.setup();
    renderPage();
    const group = screen.getByRole('group', { name: 'Filter by tag' });
    expect(
      within(group)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['All', 'HR', 'Legal', 'Sales']);
    await user.click(within(group).getByRole('button', { name: 'HR' }));
    expect(within(group).getByRole('button', { name: 'HR' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(cardNames()).toEqual([MSA.name, ICA.name]);
    expect(screen.getByText('2 results')).toBeInTheDocument();
    await user.click(within(group).getByRole('button', { name: 'Sales' }));
    expect(cardNames()).toEqual([RELEASE.name]);
    await user.click(within(group).getByRole('button', { name: 'Sales' }));
    expect(cardNames()).toHaveLength(4);
    await user.click(within(group).getByRole('button', { name: 'Legal' }));
    await user.click(within(group).getByRole('button', { name: 'All' }));
    expect(cardNames()).toHaveLength(4);
  });

  it('search and tag combine (AND)', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'HR' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search templates' }), 'contractor');
    expect(cardNames()).toEqual([ICA.name]);
  });
});

describe('TemplatesListPage — states', () => {
  it('shows skeleton cards while the first fetch is pending', () => {
    vi.spyOn(templatesApi, 'listTemplates').mockReturnValue(new Promise(() => undefined));
    renderWithProviders(
      <MemoryRouter initialEntries={['/templates']}>
        <TemplatesListPage />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText('Loading templates')).toHaveAttribute('aria-busy', 'true');
  });

  it('shows the empty state with one New template action', async () => {
    vi.spyOn(templatesApi, 'listTemplates').mockResolvedValue([]);
    renderWithProviders(
      <MemoryRouter initialEntries={['/templates']}>
        <TemplatesListPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText('No templates yet')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'New template' })).toHaveLength(1);
  });
});

describe('TemplatesListPage — card menu', () => {
  it('Edit opens the template editor in edit mode', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: `More for ${NDA.name}` }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));
    expect(screen.getByLabelText('location')).toHaveTextContent(
      `/templates/${encodeURIComponent(NDA.id)}/edit?mode=edit`,
    );
  });

  it('lists Edit, Duplicate, Tags, Direct link and Delete', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: `More for ${NDA.name}` }));
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      'Edit',
      'Duplicate',
      'Tags',
      'Direct link',
      'Delete',
    ]);
  });

  it('Duplicate adds the copy right after the original and confirms', async () => {
    const user = userEvent.setup();
    const copy: TemplateSummary = { ...NDA, id: 'copy-1', name: `${NDA.name} copy`, uses: 0 };
    vi.spyOn(templatesApi, 'duplicateTemplateApi').mockResolvedValue(copy);
    renderPage();
    await user.click(screen.getByRole('button', { name: `More for ${NDA.name}` }));
    await user.click(screen.getByRole('menuitem', { name: 'Duplicate' }));
    expect(await screen.findByText(`Duplicated as ${copy.name}`)).toBeInTheDocument();
    expect(cardNames().slice(0, 2)).toEqual([NDA.name, copy.name]);
  });

  it('says so when the duplicate fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(templatesApi, 'duplicateTemplateApi').mockRejectedValue(new Error('boom'));
    renderPage();
    await user.click(screen.getByRole('button', { name: `More for ${NDA.name}` }));
    await user.click(screen.getByRole('menuitem', { name: 'Duplicate' }));
    expect(await screen.findByText('Could not duplicate. Try again.')).toBeInTheDocument();
    expect(cardNames()).toHaveLength(4);
  });
});

describe('TemplatesListPage — delete and undo', () => {
  async function askDelete(user: ReturnType<typeof userEvent.setup>, name: string) {
    await user.click(screen.getByRole('button', { name: `More for ${name}` }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    return screen.getByRole('alertdialog', { name: `Delete ${name}?` });
  }

  it('confirms, removes the card, shows Template deleted, and Undo restores it', async () => {
    const user = userEvent.setup();
    const del = vi.spyOn(templatesApi, 'deleteTemplate').mockResolvedValue();
    const restore = vi.spyOn(templatesApi, 'restoreTemplate').mockResolvedValue(NDA);
    vi.spyOn(templatesApi, 'listTemplates').mockResolvedValue(TAGGED);
    renderPage();
    const dialog = await askDelete(user, NDA.name);
    expect(within(dialog).getByText('Sent documents stay.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(cardNames()).not.toContain(NDA.name));
    expect(del).toHaveBeenCalledWith(NDA.id);
    expect(await screen.findByText('Template deleted')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(restore).toHaveBeenCalledWith(NDA.id));
    await waitFor(() => expect(cardNames()).toContain(NDA.name));
  });

  it('Keep and Escape leave the template alone', async () => {
    const user = userEvent.setup();
    const del = vi.spyOn(templatesApi, 'deleteTemplate').mockResolvedValue();
    renderPage();
    const dialog = await askDelete(user, NDA.name);
    await user.click(within(dialog).getByRole('button', { name: 'Keep' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await askDelete(user, NDA.name);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(del).not.toHaveBeenCalled();
    expect(cardNames()).toContain(NDA.name);
  });

  it('refetches and says so when the delete fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(templatesApi, 'deleteTemplate').mockRejectedValue(new Error('boom'));
    const list = vi.spyOn(templatesApi, 'listTemplates').mockResolvedValue(TAGGED);
    renderPage();
    const dialog = await askDelete(user, NDA.name);
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Could not delete. Try again.')).toBeInTheDocument();
    await waitFor(() => expect(list).toHaveBeenCalled());
    await waitFor(() => expect(cardNames()).toContain(NDA.name));
  });
});

describe('TemplatesListPage — deep link /templates/:id/use', () => {
  it('opens the Use dialog for that template and closing returns to /templates', async () => {
    const user = userEvent.setup();
    renderPage(TAGGED, `/templates/${encodeURIComponent(MSA.id)}/use`);
    const dialog = await screen.findByRole('dialog', { name: `Use ${MSA.name}` });
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('an unknown id says "Template not found" and shows the list', async () => {
    vi.spyOn(templatesApi, 'listTemplates').mockResolvedValue(TAGGED);
    renderWithProviders(
      <MemoryRouter initialEntries={['/templates/nope/use']}>
        <Routes>
          <Route path="/templates" element={<TemplatesListPage />} />
          <Route path="/templates/:id/use" element={<TemplatesListPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Template not found')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: NDA.name })).toBeInTheDocument();
  });
});

describe('TemplatesListPage — tag edits persist to the server', () => {
  const TEMPLATE: TemplateSummary = { ...NDA, tags: ['Construction'] };
  const PEER: TemplateSummary = { ...MSA, tags: ['Legal'] };

  let listSpy: ReturnType<typeof vi.spyOn>;
  let updateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    listSpy = vi.spyOn(templatesApi, 'listTemplates').mockResolvedValue([TEMPLATE, PEER]);
    updateSpy = vi.spyOn(templatesApi, 'updateTemplate').mockImplementation(async (id, patch) => {
      const base = id === TEMPLATE.id ? TEMPLATE : PEER;
      return { ...base, ...patch, id } as TemplateSummary;
    });
    publishTemplates([TEMPLATE, PEER]);
  });

  function renderNetworkPage() {
    return renderWithProviders(
      <MemoryRouter initialEntries={['/templates']}>
        <Routes>
          <Route path="/templates" element={<TemplatesListPage />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  async function openTags(user: ReturnType<typeof userEvent.setup>) {
    await screen.findByRole('button', { name: TEMPLATE.name });
    await user.click(screen.getByRole('button', { name: `More for ${TEMPLATE.name}` }));
    await user.click(screen.getByRole('menuitem', { name: 'Tags' }));
    return screen.findByRole('dialog', { name: /edit template tags/i });
  }

  it('toggling a tag PATCHes /templates/:id with the new tags array', async () => {
    const user = userEvent.setup();
    renderNetworkPage();
    const dialog = await openTags(user);
    await user.click(within(dialog).getByRole('option', { name: /Legal/i }));
    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    expect(updateSpy.mock.calls[0]![0]).toBe(TEMPLATE.id);
    expect(updateSpy.mock.calls[0]![1]).toEqual({ tags: ['Construction', 'Legal'] });
  });

  it('creating a brand-new tag PATCHes with the appended tag', async () => {
    const user = userEvent.setup();
    renderNetworkPage();
    const dialog = await openTags(user);
    await user.type(within(dialog).getByLabelText(/find or create tag/i), 'Procurement');
    await user.click(within(dialog).getByRole('button', { name: /create.*procurement/i }));
    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    expect(updateSpy.mock.calls[0]![1]).toEqual({ tags: ['Construction', 'Procurement'] });
  });

  it('refetches when the server PATCH fails (rolls local optimistic state back)', async () => {
    const user = userEvent.setup();
    updateSpy.mockRejectedValueOnce(new Error('boom'));
    renderNetworkPage();
    const dialog = await openTags(user);
    await user.click(within(dialog).getByRole('option', { name: /Legal/i }));
    await waitFor(() => expect(listSpy.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(getTemplates().length).toBe(2);
  });
});

describe('TemplatesListPage — flagged entry points', () => {
  const WITH_PDF: TemplateSummary = { ...NDA, hasExamplePdf: true };
  const WITHOUT_PDF: TemplateSummary = { ...MSA, hasExamplePdf: false };

  it('bulk send is hidden while the flag is off', async () => {
    const user = userEvent.setup();
    vi.spyOn(sharedModule, 'isFeatureEnabled').mockReturnValue(false);
    renderPage([WITH_PDF, WITHOUT_PDF]);
    await user.click(screen.getByRole('button', { name: `More for ${WITH_PDF.name}` }));
    expect(screen.queryByRole('menuitem', { name: 'Send to many' })).toBeNull();
  });

  it('bulk send shows for a template with a saved document only, and opens the bulk send page', async () => {
    const user = userEvent.setup();
    vi.spyOn(sharedModule, 'isFeatureEnabled').mockImplementation((flag) => flag === 'bulkSend');
    renderPage([WITH_PDF, WITHOUT_PDF]);
    await user.click(screen.getByRole('button', { name: `More for ${WITHOUT_PDF.name}` }));
    expect(screen.queryByRole('menuitem', { name: 'Send to many' })).toBeNull();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: `More for ${WITH_PDF.name}` }));
    await user.click(screen.getByRole('menuitem', { name: 'Send to many' }));
    expect(screen.getByLabelText('location')).toHaveTextContent(
      `/templates/${encodeURIComponent(WITH_PDF.id)}/bulk-send`,
    );
  });
});
