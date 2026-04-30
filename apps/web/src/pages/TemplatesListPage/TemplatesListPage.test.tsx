import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { TemplatesListPage } from './TemplatesListPage';
import { SAMPLE_TEMPLATES as TEMPLATES } from '../../test/templateFixtures';
import { renderWithProviders } from '../../test/renderWithProviders';
import { setTemplates as publishTemplates, type TemplateSummary } from '../../features/templates';
import * as templatesApi from '../../features/templates/templatesApi';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="probe">{`${location.pathname}${location.search}`}</div>;
}

function renderPage() {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/templates']}>
      <Routes>
        <Route path="/templates" element={<TemplatesListPage initialTemplates={TEMPLATES} />} />
        <Route path="/templates/:id/use" element={<LocationProbe />} />
        <Route path="/document/new" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TemplatesListPage', () => {
  it('renders the "Templates" heading + lede + one card per template', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: /^templates$/i })).toBeInTheDocument();
    expect(screen.getByText(/place fields once\. reuse forever\./i)).toBeInTheDocument();
    for (const t of TEMPLATES) {
      expect(screen.getByRole('heading', { level: 3, name: t.name })).toBeInTheDocument();
    }
  });

  it('exposes a primary "New template" CTA + a dashed create tile', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /^new template$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create a new template/i })).toBeInTheDocument();
  });

  it('clicking the primary "New template" navigates to /templates/new/use', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /^new template$/i }));
    expect(screen.getByTestId('probe').textContent).toBe('/templates/new/use');
  });

  it('clicking a card navigates to the use-template route', async () => {
    renderPage();
    const first = TEMPLATES[0]!;
    // Whole card is a button labelled by the template name.
    await userEvent.click(screen.getByRole('button', { name: first.name }));
    expect(screen.getByTestId('probe').textContent).toBe(
      `/templates/${encodeURIComponent(first.id)}/use`,
    );
  });

  it('clicking the hover-overlay Use button also navigates to the use route', async () => {
    renderPage();
    const first = TEMPLATES[0]!;
    await userEvent.click(screen.getByRole('button', { name: `Use ${first.name}` }));
    expect(screen.getByTestId('probe').textContent).toBe(
      `/templates/${encodeURIComponent(first.id)}/use`,
    );
  });

  it('search filters templates case-insensitively against name + description', async () => {
    renderPage();
    await userEvent.type(
      screen.getByRole('searchbox', { name: /search by name or tag/i }),
      'mutual',
    );
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { level: 3, name: /independent contractor/i }),
      ).toBeNull();
    });
    expect(screen.getByRole('heading', { level: 3, name: /mutual nda/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: /photography release/i })).toBeNull();
  });

  it('search matches against description text', async () => {
    renderPage();
    await userEvent.type(screen.getByRole('searchbox', { name: /search by name or tag/i }), '1099');
    await waitFor(() => {
      expect(screen.queryByRole('heading', { level: 3, name: /mutual nda/i })).toBeNull();
    });
    expect(
      screen.getByRole('heading', { level: 3, name: /independent contractor/i }),
    ).toBeInTheDocument();
  });

  it('shows the empty-state status when search has zero matches', async () => {
    renderPage();
    await userEvent.type(
      screen.getByRole('searchbox', { name: /search by name or tag/i }),
      'zzznomatch',
    );
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/no templates match/i);
    });
  });

  it('Delete trigger opens a confirm modal; confirming removes the card', async () => {
    renderPage();
    const original = TEMPLATES[0]!;
    const before = screen.getAllByRole('heading', { level: 3 }).length;
    await userEvent.click(screen.getByRole('button', { name: `Delete ${original.name}` }));
    // Modal opens with a serif title + destructive Delete button.
    const dialog = await screen.findByRole('dialog', {
      name: new RegExp(`delete ${original.name}`, 'i'),
    });
    expect(within(dialog).getByText(/delete this template\?/i)).toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole('button', {
        name: new RegExp(`confirm delete ${original.name}`, 'i'),
      }),
    );
    expect(
      screen.queryByRole('heading', { level: 3, name: original.name }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 3 }).length).toBe(before - 1);
  });

  it('Delete modal Cancel keeps the card and closes the modal', async () => {
    renderPage();
    const original = TEMPLATES[0]!;
    await userEvent.click(screen.getByRole('button', { name: `Delete ${original.name}` }));
    const dialog = await screen.findByRole('dialog', {
      name: new RegExp(`delete ${original.name}`, 'i'),
    });
    await userEvent.click(within(dialog).getByRole('button', { name: /cancel/i }));
    expect(
      screen.queryByRole('dialog', { name: new RegExp(`delete ${original.name}`, 'i') }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: original.name })).toBeInTheDocument();
  });
});

// Regression suite: tag edits MUST round-trip to the server. Earlier
// behaviour optimistically updated only the local module store and
// never called PATCH /templates/:id, so tags vanished on refetch.
// We render WITHOUT `initialTemplates` here so the page takes the
// network branch (`apiUpdateTemplate`); the module store is seeded
// directly and the API client is spied/mocked.
describe('TemplatesListPage — tag edits persist to the server', () => {
  // Seed must include a template carrying tags so we have a known
  // baseline to mutate, plus a second template with the "Legal" tag
  // so the editor's `allTags` set surfaces "Legal" as a togglable
  // option (the popover only renders existing tags as <option>;
  // brand-new tags go through the create row instead).
  const TEMPLATE: TemplateSummary = {
    ...TEMPLATES[0]!,
    tags: ['Construction'],
  };
  const PEER: TemplateSummary = {
    ...TEMPLATES[1]!,
    tags: ['Legal'],
  };

  let listSpy: ReturnType<typeof vi.spyOn>;
  let updateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // The page hydrates from `listTemplates` on mount when
    // `initialTemplates` is omitted. Resolve to both seed rows so
    // `allTags` includes "Construction" + "Legal".
    listSpy = vi.spyOn(templatesApi, 'listTemplates').mockResolvedValue([TEMPLATE, PEER]);
    updateSpy = vi.spyOn(templatesApi, 'updateTemplate').mockImplementation(async (id, patch) => {
      const base = id === TEMPLATE.id ? TEMPLATE : PEER;
      // `exactOptionalPropertyTypes` means we can't spread the
      // optional `description` (typed `string`) from a patch with
      // `description?: string`. Cast to TemplateSummary — the runtime
      // shape is already correct since we only override fields that
      // exist on the base.
      return { ...base, ...patch, id } as TemplateSummary;
    });
    publishTemplates([TEMPLATE, PEER]);
  });

  afterEach(() => {
    listSpy.mockRestore();
    updateSpy.mockRestore();
    publishTemplates([]);
  });

  function renderNetworkPage() {
    // No `initialTemplates` prop → page takes the API path.
    return renderWithProviders(
      <MemoryRouter initialEntries={['/templates']}>
        <Routes>
          <Route path="/templates" element={<TemplatesListPage />} />
          <Route path="/templates/:id/use" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('toggling a tag PATCHes /templates/:id with the new tags array', async () => {
    renderNetworkPage();
    await screen.findByRole('heading', { level: 3, name: TEMPLATE.name });
    // Open the per-card tag editor via the hover overlay action.
    await userEvent.click(screen.getByRole('button', { name: `Edit tags for ${TEMPLATE.name}` }));
    const dialog = await screen.findByRole('dialog', { name: /edit template tags/i });
    // Toggle "Legal" — adds it to the existing ["Construction"] roster.
    await userEvent.click(within(dialog).getByRole('option', { name: /Legal/i }));
    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledTimes(1);
    });
    const [calledId, calledPatch] = updateSpy.mock.calls[0]!;
    expect(calledId).toBe(TEMPLATE.id);
    expect(calledPatch).toEqual({ tags: ['Construction', 'Legal'] });
  });

  it('creating a brand-new tag PATCHes with the appended tag', async () => {
    renderNetworkPage();
    await screen.findByRole('heading', { level: 3, name: TEMPLATE.name });
    await userEvent.click(screen.getByRole('button', { name: `Edit tags for ${TEMPLATE.name}` }));
    const dialog = await screen.findByRole('dialog', { name: /edit template tags/i });
    await userEvent.type(within(dialog).getByLabelText(/find or create tag/i), 'Procurement');
    await userEvent.click(within(dialog).getByRole('button', { name: /create.*procurement/i }));
    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledTimes(1);
    });
    const [, patch] = updateSpy.mock.calls[0]!;
    expect(patch).toEqual({ tags: ['Construction', 'Procurement'] });
  });

  it('refetches when the server PATCH fails (rolls local optimistic state back)', async () => {
    updateSpy.mockRejectedValueOnce(new Error('boom'));
    renderNetworkPage();
    await screen.findByRole('heading', { level: 3, name: TEMPLATE.name });
    await userEvent.click(screen.getByRole('button', { name: `Edit tags for ${TEMPLATE.name}` }));
    const dialog = await screen.findByRole('dialog', { name: /edit template tags/i });
    await userEvent.click(within(dialog).getByRole('option', { name: /Legal/i }));
    await waitFor(() => {
      // Initial mount fetch + the recovery refetch after the patch failed.
      expect(listSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });
});
