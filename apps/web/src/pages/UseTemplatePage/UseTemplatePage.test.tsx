import { describe, it, expect } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { UseTemplatePage } from './UseTemplatePage';
import { TEMPLATES } from '../../features/templates';
import { renderWithProviders } from '../../test/renderWithProviders';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="probe">{`${location.pathname}${location.search}`}</div>;
}

function renderAt(initialPath: string) {
  return renderWithProviders(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/templates" element={<LocationProbe />} />
        <Route path="/templates/:id/use" element={<UseTemplatePage />} />
        <Route path="/document/new" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

const SAMPLE = TEMPLATES[0]!;

describe('UseTemplatePage', () => {
  it('renders the template name, id, and meta', () => {
    renderAt(`/templates/${encodeURIComponent(SAMPLE.id)}/use`);
    expect(screen.getByRole('heading', { level: 1, name: SAMPLE.name })).toBeInTheDocument();
    expect(screen.getByText(SAMPLE.id)).toBeInTheDocument();
    expect(screen.getByText(`${SAMPLE.pages} pages`)).toBeInTheDocument();
    expect(screen.getByText(`${SAMPLE.fieldCount} fields`)).toBeInTheDocument();
  });

  it('lists every field rule from the template', () => {
    renderAt(`/templates/${encodeURIComponent(SAMPLE.id)}/use`);
    const list = screen.getByRole('list');
    expect(list.querySelectorAll('li')).toHaveLength(SAMPLE.fields.length);
  });

  it('clicking Continue navigates to /document/new with the template query arg', async () => {
    renderAt(`/templates/${encodeURIComponent(SAMPLE.id)}/use`);
    await userEvent.click(screen.getByRole('button', { name: /continue with this template/i }));
    expect(screen.getByTestId('probe').textContent).toBe(
      `/document/new?template=${encodeURIComponent(SAMPLE.id)}`,
    );
  });

  it('clicking Back to templates returns to /templates', async () => {
    renderAt(`/templates/${encodeURIComponent(SAMPLE.id)}/use`);
    await userEvent.click(screen.getByRole('button', { name: /back to templates/i }));
    expect(screen.getByTestId('probe').textContent).toBe('/templates');
  });

  it('shows a not-found state for an unknown template id', () => {
    renderAt('/templates/TPL-NOPE/use');
    expect(screen.getByRole('alert')).toHaveTextContent(/template not found/i);
  });
});
