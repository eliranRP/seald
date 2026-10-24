import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_USER_SETTINGS, type UserSettings } from 'shared';
import { renderWithProviders } from '@/test/renderWithProviders';

const getMock = vi.fn();
const patchMock = vi.fn();
vi.mock('@/lib/api/apiClient', () => ({
  apiClient: {
    get: (...a: unknown[]): unknown => getMock(...a),
    patch: (...a: unknown[]): unknown => patchMock(...a),
  },
}));
const toPng = vi.fn();
vi.mock('./imageFileToPng', () => ({
  imageFileToPng: (...a: unknown[]): unknown => toPng(...a),
}));

import { SignatureSection } from './SignatureSection';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

function serve(settings: UserSettings): void {
  getMock.mockResolvedValue({ data: settings });
}

describe('SignatureSection', () => {
  beforeEach(() => {
    getMock.mockReset();
    patchMock.mockReset().mockResolvedValue({ data: DEFAULT_USER_SETTINGS });
    toPng.mockReset();
    serve({ ...DEFAULT_USER_SETTINGS, display_name: 'Eliran Azulay' });
  });

  it('starts on Type with the name and derived initials', async () => {
    renderWithProviders(<SignatureSection />);
    expect(await screen.findByRole('radio', { name: 'Type' })).toBeChecked();
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Typed signature' })).toHaveValue('Eliran Azulay'),
    );
    expect(screen.getByRole('textbox', { name: 'Initials' })).toHaveValue('EA');
    expect(screen.getByText('Used when you sign your own documents.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });

  it('saves an edited typed signature and initials', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignatureSection />);
    const typed = await screen.findByRole('textbox', { name: 'Typed signature' });
    await user.clear(typed);
    await user.type(typed, 'E. Azulay');
    const initials = screen.getByRole('textbox', { name: 'Initials' });
    await user.clear(initials);
    await user.type(initials, 'EZ');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(patchMock).toHaveBeenCalledWith('/me/settings', {
        signature: { type: 'typed', typed_text: 'E. Azulay', image: null },
        initials: 'EZ',
      }),
    );
    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });

  it('will not save an empty typed signature', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignatureSection />);
    await user.clear(await screen.findByRole('textbox', { name: 'Typed signature' }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('Draw shows a pad with Clear, and Save waits for a drawing', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignatureSection />);
    await user.click(await screen.findByRole('radio', { name: 'Draw' }));
    expect(screen.getByRole('img', { name: /signature pad/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('Upload takes an image, previews it and saves it as an uploaded signature', async () => {
    const user = userEvent.setup();
    toPng.mockResolvedValue(PNG);
    renderWithProviders(<SignatureSection />);
    await user.click(await screen.findByRole('radio', { name: 'Upload' }));
    const file = new File(['x'], 'sig.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Signature image'), file);

    expect(await screen.findByRole('img', { name: 'Your uploaded signature' })).toHaveAttribute(
      'src',
      PNG,
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(patchMock).toHaveBeenCalledWith(
        '/me/settings',
        expect.objectContaining({
          signature: { type: 'uploaded', typed_text: 'Eliran Azulay', image: PNG },
        }),
      ),
    );
  });

  it('tells the user when the image cannot be used', async () => {
    const user = userEvent.setup();
    toPng.mockResolvedValue(null);
    renderWithProviders(<SignatureSection />);
    await user.click(await screen.findByRole('radio', { name: 'Upload' }));
    await user.upload(
      screen.getByLabelText('Signature image'),
      new File(['x'], 'sig.png', { type: 'image/png' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('PNG or JPG under 1 MB');
  });

  it('shows a saved drawn signature on its tab', async () => {
    serve({
      ...DEFAULT_USER_SETTINGS,
      signature: { type: 'drawn', typed_text: null, image: PNG },
    });
    renderWithProviders(<SignatureSection />);
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Draw' })).toBeChecked());
  });

  it('Cancel drops the edits', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignatureSection />);
    const typed = await screen.findByRole('textbox', { name: 'Typed signature' });
    await user.type(typed, 'x');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('textbox', { name: 'Typed signature' })).toHaveValue('Eliran Azulay');
  });
});
