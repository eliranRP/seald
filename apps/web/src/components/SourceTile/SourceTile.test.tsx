import { describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { FileUp } from 'lucide-react';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '@/test/renderWithTheme';
import { SourceTile } from './SourceTile';

describe('SourceTile', () => {
  it('is a radio that reflects selection and shows its hint', () => {
    const { getByRole, getByText } = renderWithTheme(
      <SourceTile icon={FileUp} label="Upload file" meta="PDF, Word" selected />,
    );
    expect(getByRole('radio', { name: /upload file/i })).toHaveAttribute('aria-checked', 'true');
    expect(getByText('PDF, Word')).toBeInTheDocument();
  });

  it('fires onClick', () => {
    const onClick = vi.fn();
    const { getByRole } = renderWithTheme(
      <SourceTile icon={FileUp} label="Template" onClick={onClick} />,
    );
    const tile = getByRole('radio', { name: 'Template' });
    expect(tile).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(tile);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(
      <div role="radiogroup" aria-label="Source">
        <SourceTile icon={FileUp} label="Upload file" selected />
      </div>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
