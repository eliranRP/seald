import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { RECORD_ACCESS_ATTESTATION, SIGNATURE_LEVEL_NOTE, SENDER_PROGRESS_NOTE } from 'shared';
import { renderWithTheme } from '../../test/renderWithTheme';
import { RetentionNotice } from './RetentionNotice';
import { SenderProgressNote } from './SenderProgressNote';
import { SignatureLevelNote } from './SignatureLevelNote';

describe('shared product claims', () => {
  it('describes a simple electronic signature without an advanced or qualified claim', () => {
    renderWithTheme(<SignatureLevelNote />);
    expect(screen.getByText(SIGNATURE_LEVEL_NOTE)).toBeInTheDocument();
    expect(screen.queryByText(/advanced electronic signature/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/legally equivalent/i)).not.toBeInTheDocument();
  });

  it('does not promise a 7-year purge', () => {
    renderWithTheme(<RetentionNotice verifyPath="/verify/abc" />);
    expect(screen.getByRole('link', { name: '/verify/abc' })).toHaveAttribute(
      'href',
      '/verify/abc',
    );
    expect(screen.queryByText(/7 years/i)).not.toBeInTheDocument();
  });

  it('describes the emails the sender actually receives', () => {
    renderWithTheme(
      <p>
        <SenderProgressNote />
      </p>,
    );
    expect(screen.getByText(SENDER_PROGRESS_NOTE)).toBeInTheDocument();
    expect(screen.queryByText(/the moment each signature lands/i)).not.toBeInTheDocument();
  });

  it('keeps the record-access attestation as a capability, not a completed download', () => {
    expect(RECORD_ACCESS_ATTESTATION).toMatch(/can open and download/i);
    expect(RECORD_ACCESS_ATTESTATION).not.toMatch(/was able to open/i);
  });
});
