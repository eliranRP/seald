import { describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '../../test/renderWithTheme';
import { PlaceOnPagesPopover } from './PlaceOnPagesPopover';

const getFirstArg = <T,>(mock: ReturnType<typeof vi.fn>): T | undefined => {
  const first = mock.mock.calls[0];
  return first ? (first[0] as T) : undefined;
};

const getSecondArg = <T,>(mock: ReturnType<typeof vi.fn>): T | undefined => {
  const first = mock.mock.calls[0];
  return first ? (first[1] as T) : undefined;
};

const noop = (): void => {};

describe('PlaceOnPagesPopover', () => {
  it('renders nothing when open=false', () => {
    const { container } = renderWithTheme(
      <PlaceOnPagesPopover
        open={false}
        currentPage={1}
        totalPages={3}
        onApply={noop}
        onCancel={noop}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders dialog with all five option labels when open', () => {
    const { getByRole, getByText } = renderWithTheme(
      <PlaceOnPagesPopover open currentPage={2} totalPages={5} onApply={noop} onCancel={noop} />,
    );
    expect(getByRole('dialog')).toBeDefined();
    expect(getByText('Only this page')).toBeDefined();
    expect(getByText('All pages')).toBeDefined();
    expect(getByText('All pages but last')).toBeDefined();
    expect(getByText('Last page')).toBeDefined();
    expect(getByText('Custom pages')).toBeDefined();
  });

  it('updates aria-checked when a radio is selected', async () => {
    const user = userEvent.setup();
    const { getByText, getByRole } = renderWithTheme(
      <PlaceOnPagesPopover open currentPage={1} totalPages={5} onApply={noop} onCancel={noop} />,
    );
    await user.click(getByText('Only this page'));
    const radio = getByRole('radio', { checked: true });
    expect(radio.getAttribute('value')).toBe('this');
  });

  it('updates hint text when mode changes', async () => {
    const user = userEvent.setup();
    const { getByText, queryByText } = renderWithTheme(
      <PlaceOnPagesPopover open currentPage={1} totalPages={5} onApply={noop} onCancel={noop} />,
    );
    expect(getByText('Create a linked copy on every page of the document.')).toBeDefined();
    await user.click(getByText('Last page'));
    expect(getByText('Place only on the final page.')).toBeDefined();
    expect(queryByText('Create a linked copy on every page of the document.')).toBeNull();
  });

  it('reveals the custom pages input when "Custom pages" is selected', async () => {
    const user = userEvent.setup();
    const { getByText, queryByPlaceholderText, getByPlaceholderText } = renderWithTheme(
      <PlaceOnPagesPopover open currentPage={1} totalPages={5} onApply={noop} onCancel={noop} />,
    );
    expect(queryByPlaceholderText('e.g. 1, 3, 5')).toBeNull();
    await user.click(getByText('Custom pages'));
    expect(getByPlaceholderText('e.g. 1, 3, 5')).toBeDefined();
  });

  it('calls onApply("this", undefined) when Apply is clicked with mode="this"', async () => {
    const onApply = vi.fn();
    const user = userEvent.setup();
    const { getByText, getByRole } = renderWithTheme(
      <PlaceOnPagesPopover
        open
        currentPage={1}
        totalPages={5}
        initialMode="this"
        onApply={onApply}
        onCancel={noop}
      />,
    );
    expect(getByText('Only this page')).toBeDefined();
    await user.click(getByRole('button', { name: 'Apply' }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(getFirstArg<string>(onApply)).toBe('this');
    expect(getSecondArg<unknown>(onApply)).toBeUndefined();
  });

  it('calls onApply("custom", [1, 3, 5]) with parsed pages', async () => {
    const onApply = vi.fn();
    const user = userEvent.setup();
    const { getByPlaceholderText, getByRole } = renderWithTheme(
      <PlaceOnPagesPopover
        open
        currentPage={1}
        totalPages={10}
        initialMode="custom"
        onApply={onApply}
        onCancel={noop}
      />,
    );
    const input = getByPlaceholderText('e.g. 1, 3, 5');
    await user.type(input, '1, 3, 5');
    await user.click(getByRole('button', { name: 'Apply' }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(getFirstArg<string>(onApply)).toBe('custom');
    const pages = getSecondArg<ReadonlyArray<number>>(onApply);
    expect(pages).toEqual([1, 3, 5]);
  });

  it('filters out-of-range numbers when parsing custom pages', async () => {
    const onApply = vi.fn();
    const user = userEvent.setup();
    const { getByPlaceholderText, getByRole } = renderWithTheme(
      <PlaceOnPagesPopover
        open
        currentPage={1}
        totalPages={4}
        initialMode="custom"
        onApply={onApply}
        onCancel={noop}
      />,
    );
    const input = getByPlaceholderText('e.g. 1, 3, 5');
    await user.type(input, '2, 99');
    await user.click(getByRole('button', { name: 'Apply' }));
    const pages = getSecondArg<ReadonlyArray<number>>(onApply);
    expect(pages).toEqual([2]);
  });

  it('calls onCancel when Cancel button is clicked', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    const { getByText } = renderWithTheme(
      <PlaceOnPagesPopover
        open
        currentPage={1}
        totalPages={5}
        onApply={noop}
        onCancel={onCancel}
      />,
    );
    await user.click(getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when backdrop is clicked', () => {
    const onCancel = vi.fn();
    const { getByTestId } = renderWithTheme(
      <PlaceOnPagesPopover
        open
        currentPage={1}
        totalPages={5}
        onApply={noop}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(getByTestId('place-on-pages-backdrop'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('does not call onCancel when the card itself is clicked', () => {
    const onCancel = vi.fn();
    const { getByRole } = renderWithTheme(
      <PlaceOnPagesPopover
        open
        currentPage={1}
        totalPages={5}
        onApply={noop}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(getByRole('dialog'));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel when ESC is pressed', () => {
    const onCancel = vi.fn();
    renderWithTheme(
      <PlaceOnPagesPopover
        open
        currentPage={1}
        totalPages={5}
        onApply={noop}
        onCancel={onCancel}
      />,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('has no axe violations when open', async () => {
    const { container } = renderWithTheme(
      <PlaceOnPagesPopover open currentPage={2} totalPages={5} onApply={noop} onCancel={noop} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
