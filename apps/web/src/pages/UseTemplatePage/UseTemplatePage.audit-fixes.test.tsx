import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import * as flagsModule from 'shared';
import { renderWithProviders } from '../../test/renderWithProviders';
import { setTemplates } from '../../features/templates';
import { SAMPLE_TEMPLATES as TEMPLATES } from '../../test/templateFixtures';

vi.mock('../../routes/settings/integrations/useGDriveAccounts', () => ({
  useGDriveAccounts: vi.fn().mockReturnValue({ data: [], isLoading: false, isError: false }),
  GDRIVE_ACCOUNTS_KEY: ['integrations', 'gdrive', 'accounts'],
  useConnectGDrive: () => ({ mutate: vi.fn() }),
  useReconnectGDrive: () => ({ mutate: vi.fn() }),
  useDisconnectGDrive: vi.fn(),
  useGDriveOAuthMessageListener: vi.fn(),
}));

vi.mock('../../components/drive-picker', () => ({
  DrivePicker: (props: { open: boolean }): JSX.Element | null => {
    if (!props.open) return null;
    return <div data-testid="drive-picker-stub" />;
  },
  PICKER_HEIGHT_PX: 600,
  PICKER_WIDTH_PX: 760,
}));

import { UseTemplatePage } from './UseTemplatePage';

const SAMPLE = TEMPLATES[0]!;

function renderAt(path: string) {
  return renderWithProviders(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/templates/:id/use" element={<UseTemplatePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

/**
 * Regression coverage for PR-7 (audit slice A — Sender):
 *   L-19  ArrowLeft / ArrowRight switch the segmented "Document source"
 *         control between "Use saved document" and "Upload a new one"
 *         per ARIA-1.2 radio-group keyboard semantics. Previously only
 *         Tab + Space worked.
 */
describe('UseTemplatePage — segmented control arrow-key nav (PR-7 L-19)', () => {
  let isFeatureEnabledSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    setTemplates(TEMPLATES);
    isFeatureEnabledSpy = vi.spyOn(flagsModule, 'isFeatureEnabled');
    isFeatureEnabledSpy.mockReturnValue(true);
  });
  afterEach(() => {
    setTemplates([]);
    isFeatureEnabledSpy.mockRestore();
  });

  it('ArrowRight moves selection from "Use saved document" to "Upload a new one"', () => {
    renderAt(`/templates/${encodeURIComponent(SAMPLE.id)}/use`);
    const savedRadio = screen.getByRole('radio', { name: /use saved document/i });
    const uploadRadio = screen.getByRole('radio', { name: /upload a new one/i });
    // Default selection: 'saved'.
    expect(savedRadio).toHaveAttribute('aria-checked', 'true');
    expect(uploadRadio).toHaveAttribute('aria-checked', 'false');

    savedRadio.focus();
    fireEvent.keyDown(savedRadio, { key: 'ArrowRight' });

    expect(uploadRadio).toHaveAttribute('aria-checked', 'true');
    expect(savedRadio).toHaveAttribute('aria-checked', 'false');
    expect(document.activeElement).toBe(uploadRadio);
  });

  it('ArrowLeft moves selection back from "Upload a new one" to "Use saved document"', () => {
    renderAt(`/templates/${encodeURIComponent(SAMPLE.id)}/use`);
    // Click upload first so the test starts from the second segment.
    const uploadRadio = screen.getByRole('radio', { name: /upload a new one/i });
    fireEvent.click(uploadRadio);
    expect(uploadRadio).toHaveAttribute('aria-checked', 'true');

    uploadRadio.focus();
    fireEvent.keyDown(uploadRadio, { key: 'ArrowLeft' });

    const savedRadio = screen.getByRole('radio', { name: /use saved document/i });
    expect(savedRadio).toHaveAttribute('aria-checked', 'true');
    expect(uploadRadio).toHaveAttribute('aria-checked', 'false');
    expect(document.activeElement).toBe(savedRadio);
  });
});
