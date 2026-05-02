import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TemplatesListPage } from './TemplatesListPage';
import { SAMPLE_TEMPLATES as TEMPLATES } from '../../test/templateFixtures';
import { renderWithProviders } from '../../test/renderWithProviders';

/**
 * Regression coverage discovered by the templates+contacts QA audit
 * (qa/templates-contacts-bdd, 2026-05-02).
 *
 * Bug A — The delete-confirmation modal previously trapped users:
 *         clicking the backdrop closed it, but pressing Escape did
 *         nothing. Per WCAG 2.1.2 (No Keyboard Trap) and the project's
 *         own a11y standards, all modal dialogs must close on Escape.
 */

function renderPage() {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/templates']}>
      <Routes>
        <Route path="/templates" element={<TemplatesListPage initialTemplates={TEMPLATES} />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TemplatesListPage — delete modal a11y (regression)', () => {
  it('Bug A — Escape closes the delete confirmation modal without deleting the template', async () => {
    renderPage();
    const original = TEMPLATES[0]!;
    const before = screen.getAllByRole('heading', { level: 3 }).length;

    await userEvent.click(screen.getByRole('button', { name: `Delete ${original.name}` }));
    const dialog = await screen.findByRole('dialog', {
      name: new RegExp(`delete ${original.name}`, 'i'),
    });
    expect(within(dialog).getByText(/delete this template\?/i)).toBeInTheDocument();

    // Escape must dismiss the modal — NOT delete.
    await userEvent.keyboard('{Escape}');

    expect(
      screen.queryByRole('dialog', { name: new RegExp(`delete ${original.name}`, 'i') }),
    ).not.toBeInTheDocument();
    // Template card is still present.
    expect(screen.getByRole('heading', { level: 3, name: original.name })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 3 }).length).toBe(before);
  });
});
