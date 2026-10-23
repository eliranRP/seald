import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { SAMPLE_TEMPLATES as TEMPLATES } from '@/test/templateFixtures';
import { renderWithProviders } from '@/test/renderWithProviders';
import { setTemplates as publishTemplates } from '@/features/templates';
import type { TemplateSummary } from '@/features/templates';
import * as templatesApi from '@/features/templates/templatesApi';
import { TemplatesListPage } from './TemplatesListPage';

function LocationProbe() {
  const loc = useLocation();
  return <output aria-label="location">{`${loc.pathname}${loc.search}`}</output>;
}

const TAGGED: ReadonlyArray<TemplateSummary> = TEMPLATES.map((t, i) => ({
  ...t,
  tags: i < 2 ? ['HR'] : ['Sales'],
}));

function renderPhone() {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/templates']}>
      <Routes>
        <Route path="/templates" element={<TemplatesListPage initialTemplates={TAGGED} />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  publishTemplates([]);
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
  vi.restoreAllMocks();
  publishTemplates([]);
});

describe('TemplatesListPage — phone', () => {
  it('lists template rows with the search and new-template icons and the tag pills', () => {
    renderPhone();
    expect(screen.getByRole('button', { name: TAGGED[0]!.name })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Search templates' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New template' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Filter by tag' })).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  it('the search icon opens the field, which filters, and X closes it', async () => {
    const user = userEvent.setup();
    renderPhone();
    await user.click(screen.getByRole('button', { name: 'Search templates' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search templates' }), 'photography');
    expect(screen.queryByRole('button', { name: TAGGED[0]!.name })).toBeNull();
    expect(screen.getByRole('button', { name: TAGGED[3]!.name })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByRole('button', { name: TAGGED[0]!.name })).toBeInTheDocument();
  });

  it('⋯ opens a sheet with Edit, Duplicate, Tags and Delete', async () => {
    const user = userEvent.setup();
    renderPhone();
    await user.click(screen.getByRole('button', { name: `More for ${TAGGED[0]!.name}` }));
    const sheet = screen.getByRole('dialog');
    expect(
      within(sheet)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Edit', 'Duplicate', 'Tags', 'Delete']);
    await user.click(within(sheet).getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('location')).toHaveTextContent(
      `/templates/${encodeURIComponent(TAGGED[0]!.id)}/edit?mode=edit`,
    );
  });

  it('Delete in the sheet asks first, then deletes', async () => {
    const user = userEvent.setup();
    const del = vi.spyOn(templatesApi, 'deleteTemplate').mockResolvedValue();
    renderPhone();
    await user.click(screen.getByRole('button', { name: `More for ${TAGGED[0]!.name}` }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    const confirm = screen.getByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));
    expect(del).toHaveBeenCalledWith(TAGGED[0]!.id);
  });

  it('tapping a row opens the Use sheet', async () => {
    const user = userEvent.setup();
    renderPhone();
    await user.click(screen.getByRole('button', { name: TAGGED[0]!.name }));
    expect(
      await screen.findByRole('dialog', { name: `Use ${TAGGED[0]!.name}` }),
    ).toBeInTheDocument();
  });
});
