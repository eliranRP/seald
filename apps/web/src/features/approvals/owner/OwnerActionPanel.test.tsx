import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { ESIGN_DISCLOSURE_VERSION, RECORD_ACCESS_ATTESTATION } from 'shared';
import { renderWithTheme } from '@/test/renderWithTheme';

// The capture sheet is its own component with its own tests; here it hands
// back a tiny PNG as soon as it opens.
vi.mock('@/components/SignatureCapture', () => ({
  SignatureCapture: ({
    open,
    kind,
    onApply,
  }: {
    open: boolean;
    kind: string;
    onApply: (r: { blob: Blob; format: string; font?: string }) => void;
  }) =>
    open ? (
      <button
        type="button"
        onClick={() => {
          onApply({
            blob: new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' }),
            format: 'typed',
            font: 'Caveat',
          });
        }}
      >
        {`Apply ${kind}`}
      </button>
    ) : null,
}));

import { OwnerActionPanel } from './OwnerActionPanel';
import { fakeOwnerDetail } from './fixtures';

describe('OwnerActionPanel (WP-45)', () => {
  it('account deletion: repeats the warning; Approve only once the account email is typed', async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    const { container } = renderWithTheme(
      <OwnerActionPanel
        detail={fakeOwnerDetail('account_delete')}
        busy={null}
        onApprove={onApprove}
        onDeny={vi.fn()}
      />,
    );
    expect(screen.getByRole('note')).toHaveTextContent(/permanently delete your account/i);
    expect(screen.getByRole('note')).toHaveTextContent('cannot be undone');
    const del = screen.getByRole('button', { name: 'Delete my account' });
    expect(del).toBeDisabled();
    const field = screen.getByRole('textbox', { name: 'Type your account email to confirm' });
    await user.type(field, 'someone@else.test');
    expect(del).toBeDisabled();
    await user.clear(field);
    await user.type(field, 'Owner@Example.test ');
    expect(del).toBeEnabled();
    await user.click(del);
    expect(onApprove).toHaveBeenCalledWith({ confirm_email: 'Owner@Example.test' });
    expect(await axe(container)).toHaveNoViolations();
  });

  it('signing as yourself: consent and both images before Approve; the body carries them', async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    renderWithTheme(
      <OwnerActionPanel
        detail={fakeOwnerDetail('envelope_sign_as_signer')}
        busy={null}
        onApprove={onApprove}
        onDeny={vi.fn()}
      />,
    );
    const approve = screen.getByRole('button', { name: 'Approve and sign' });
    expect(approve).toBeDisabled();
    expect(screen.getByRole('link', { name: 'ESIGN Consumer Disclosure' })).toHaveAttribute(
      'href',
      '/legal/esign-disclosure',
    );
    await user.click(
      screen.getByRole('checkbox', { name: /ESIGN Consumer Disclosure and consent/ }),
    );
    await user.click(screen.getByRole('checkbox', { name: RECORD_ACCESS_ATTESTATION }));
    await user.click(screen.getByRole('checkbox', { name: /intend to sign/ }));
    expect(approve).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Adopt your signature' }));
    await user.click(screen.getByRole('button', { name: 'Apply signature' }));
    await screen.findByRole('button', { name: 'Signature adopted · change' });
    expect(approve).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Adopt your initials' }));
    await user.click(screen.getByRole('button', { name: 'Apply initials' }));
    await screen.findByRole('button', { name: 'Initials adopted · change' });

    await waitFor(() => {
      expect(approve).toBeEnabled();
    });
    await user.click(approve);
    expect(onApprove).toHaveBeenCalledWith({
      esign_disclosure_version: ESIGN_DISCLOSURE_VERSION,
      record_access: true,
      intent_to_sign: true,
      signature: { image_base64: 'iVBORw==', format: 'typed', font: 'Caveat' },
      initials: { image_base64: 'iVBORw==', format: 'typed', font: 'Caveat' },
    });
  });

  it('turning approval off quotes the owner responsibility; Approve and Deny only', async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    const onDeny = vi.fn();
    renderWithTheme(
      <OwnerActionPanel
        detail={fakeOwnerDetail('approval_required_toggle')}
        busy={null}
        onApprove={onApprove}
        onDeny={onDeny}
      />,
    );
    expect(screen.getByRole('note')).toHaveTextContent('Terms §4.1');
    await user.click(screen.getByRole('button', { name: 'Deny' }));
    expect(onDeny).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onApprove).toHaveBeenCalledWith();
  });

  it('a new key says it shows once on this page; busy disables the other button', () => {
    renderWithTheme(
      <OwnerActionPanel
        detail={fakeOwnerDetail('api_key_create')}
        busy="approve"
        onApprove={vi.fn()}
        onDeny={vi.fn()}
      />,
    );
    expect(screen.getByRole('note')).toHaveTextContent('shows it once on this page');
    expect(screen.getByRole('button', { name: 'Deny' })).toBeDisabled();
  });
});
