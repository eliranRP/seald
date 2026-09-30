import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { SENDER_PROGRESS_NOTE, SENDER_PROGRESS_SELF_SIGNER_NOTE } from 'shared';
import { renderWithTheme } from '../../test/renderWithTheme';
import { SenderProgressNote } from './SenderProgressNote';

describe('SenderProgressNote', () => {
  it('describes the emails the sender actually receives', () => {
    renderWithTheme(
      <p>
        <SenderProgressNote />
      </p>,
    );
    expect(screen.getByText(SENDER_PROGRESS_NOTE)).toBeInTheDocument();
    expect(screen.getByText(SENDER_PROGRESS_SELF_SIGNER_NOTE)).toBeInTheDocument();
    expect(screen.queryByText(/the moment each signature lands/i)).not.toBeInTheDocument();
  });
});
