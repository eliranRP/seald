import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithTheme } from '../../test/renderWithTheme';
import { CodeSnippet } from './CodeSnippet';

describe('CodeSnippet', () => {
  it('copies the code', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const { getByRole } = renderWithTheme(<CodeSnippet label="Cursor" code="Bearer <YOUR_KEY>" />);
    await userEvent.click(getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith('Bearer <YOUR_KEY>');
    expect(getByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });
});
