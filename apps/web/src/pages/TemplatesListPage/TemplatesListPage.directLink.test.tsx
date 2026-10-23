import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SAMPLE_TEMPLATES as TEMPLATES } from '@/test/templateFixtures';
import { renderWithProviders } from '@/test/renderWithProviders';
import { setTemplates as publishTemplates } from '@/features/templates';

const getMock = vi.fn();

vi.mock('@/lib/api/apiClient', () => ({
  apiClient: { get: (...args: unknown[]): unknown => getMock(...args) },
}));
vi.mock('@/lib/api/verifyApiClient', () => ({ verifyApiClient: {} }));
vi.mock('@/features/templates/templatesApi', () => ({
  listTemplates: () => Promise.resolve(TEMPLATES),
  deleteTemplate: () => Promise.resolve(),
  updateTemplate: () => Promise.resolve(TEMPLATES[0]),
}));

import { TemplatesListPage } from './TemplatesListPage';

type FlagHost = { __SEALD_FEATURE_OVERRIDES__?: Record<string, boolean> };

function renderPage() {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/templates']}>
      <Routes>
        <Route path="/templates" element={<TemplatesListPage initialTemplates={TEMPLATES} />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TemplatesListPage direct link (WP-37)', () => {
  beforeEach(() => {
    publishTemplates([...TEMPLATES]);
    getMock.mockReset();
    getMock.mockResolvedValue({ data: { link: null } });
  });
  afterEach(() => {
    delete (globalThis as unknown as FlagHost).__SEALD_FEATURE_OVERRIDES__;
  });

  it('shows no Link action while directLinks is off', () => {
    (globalThis as unknown as FlagHost).__SEALD_FEATURE_OVERRIDES__ = { directLinks: false };
    renderPage();
    expect(
      screen.queryByRole('button', { name: `Direct link for ${TEMPLATES[0]!.name}` }),
    ).not.toBeInTheDocument();
  });

  it('opens the direct link settings from the card while directLinks is on, and closes them', async () => {
    (globalThis as unknown as FlagHost).__SEALD_FEATURE_OVERRIDES__ = { directLinks: true };
    renderPage();
    const name = TEMPLATES[0]!.name;
    await userEvent.click(screen.getByRole('button', { name: `Direct link for ${name}` }));
    const dialog = await screen.findByRole('dialog', { name: `Direct link for ${name}` });
    expect(dialog).toBeInTheDocument();
    expect(getMock).toHaveBeenCalledWith(
      `/templates/${encodeURIComponent(TEMPLATES[0]!.id)}/direct-link`,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog', { name: /Direct link for/ })).not.toBeInTheDocument();
  });
});
