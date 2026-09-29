import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { SIGNATURE_LEVEL_NOTE } from 'shared';
import { renderWithTheme } from '../../test/renderWithTheme';
import { SignatureLevelNote } from './SignatureLevelNote';

describe('SignatureLevelNote', () => {
  it('describes a simple electronic signature without an advanced or qualified claim', () => {
    renderWithTheme(<SignatureLevelNote />);
    expect(screen.getByText(SIGNATURE_LEVEL_NOTE)).toBeInTheDocument();
    expect(screen.queryByText(/advanced electronic signature/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/legally equivalent/i)).not.toBeInTheDocument();
  });
});
