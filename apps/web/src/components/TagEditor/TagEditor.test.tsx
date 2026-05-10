import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithTheme } from '../../test/renderWithTheme';
import { TagEditor } from './TagEditor';

describe('TagEditor', () => {
  it('renders one chip per current tag', () => {
    const { getByText } = renderWithTheme(
      <TagEditor value={['urgent', 'tax-2026']} onChange={() => {}} />,
    );
    expect(getByText('urgent')).toBeInTheDocument();
    expect(getByText('tax-2026')).toBeInTheDocument();
  });

  it('Enter on a typed value adds a normalised tag', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { getByLabelText } = renderWithTheme(
      <TagEditor value={['urgent']} onChange={onChange} />,
    );
    const input = getByLabelText('Add tag');
    await user.type(input, '  Tax 2026  {enter}');
    expect(onChange).toHaveBeenCalledWith(['urgent', 'tax 2026']);
  });

  it('a comma key acts as Enter (paste-friendly delimiter)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { getByLabelText } = renderWithTheme(<TagEditor value={[]} onChange={onChange} />);
    await user.type(getByLabelText('Add tag'), 'wickliff,');
    expect(onChange).toHaveBeenCalledWith(['wickliff']);
  });

  it('Backspace at empty input removes the last chip', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { getByLabelText } = renderWithTheme(
      <TagEditor value={['urgent', 'tax-2026']} onChange={onChange} />,
    );
    const input = getByLabelText('Add tag');
    await user.click(input);
    await user.keyboard('{Backspace}');
    expect(onChange).toHaveBeenCalledWith(['urgent']);
  });

  it('does not add a duplicate tag when Enter is pressed on an existing value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { getByLabelText } = renderWithTheme(
      <TagEditor value={['urgent']} onChange={onChange} />,
    );
    await user.type(getByLabelText('Add tag'), 'URGENT{enter}');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('caps additions at the max (default 10)', () => {
    const onChange = vi.fn();
    const ten = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
    const { getByLabelText } = renderWithTheme(<TagEditor value={ten} onChange={onChange} />);
    const input = getByLabelText('Add tag') as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });

  it('shows autocomplete suggestions filtered by the typed substring', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { getByLabelText, getByRole } = renderWithTheme(
      <TagEditor value={[]} onChange={onChange} suggestions={['urgent', 'tax-2026', 'wickliff']} />,
    );
    const input = getByLabelText('Add tag');
    await user.type(input, 'tax');
    const opt = getByRole('option', { name: /tax-2026/i });
    expect(opt).toBeInTheDocument();
  });
});
