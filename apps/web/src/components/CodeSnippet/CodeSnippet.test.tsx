import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { renderWithTheme } from '../../test/renderWithTheme';
import { CodeSnippet } from './CodeSnippet';

describe('CodeSnippet', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the code as text', () => {
    renderWithTheme(<CodeSnippet label="Command" code="npx run <thing>" />);
    expect(screen.getByRole('group', { name: 'Command' })).toBeInTheDocument();
    expect(screen.getByText('npx run <thing>')).toBeInTheDocument();
  });

  it('copies the code and says Copied', async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn();
    renderWithTheme(<CodeSnippet label="Command" code="npx run" onCopy={onCopy} />);
    await user.click(screen.getByRole('button', { name: 'Copy Command' }));
    expect(await screen.findByRole('button', { name: 'Copy Command' })).toHaveTextContent('Copied');
    expect(await navigator.clipboard.readText()).toBe('npx run');
    expect(onCopy).toHaveBeenCalledTimes(1);
  });

  it('stays on Copy when the clipboard rejects', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    const onCopy = vi.fn();
    renderWithTheme(<CodeSnippet label="Command" code="x" onCopy={onCopy} />);
    await user.click(screen.getByRole('button', { name: 'Copy Command' }));
    expect(screen.getByRole('button', { name: 'Copy Command' })).toHaveTextContent('Copy');
    expect(onCopy).not.toHaveBeenCalled();
  });
});
