import { describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '@/test/renderWithTheme';
import { FlowHeader } from './FlowHeader';

const STEPS = [
  { label: 'Upload', state: 'done' },
  { label: 'Prepare', state: 'active' },
  { label: 'Send', state: 'todo' },
] as const;

describe('FlowHeader', () => {
  it('lists the steps and marks the active one as current', () => {
    const { getByRole, getAllByRole } = renderWithTheme(<FlowHeader steps={STEPS} />);
    expect(getByRole('list', { name: 'Progress' })).toBeInTheDocument();
    const items = getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[1]).toHaveAttribute('aria-current', 'step');
    expect(items[0]).not.toHaveAttribute('aria-current');
  });

  it('shows the title and fires onClose', () => {
    const onClose = vi.fn();
    const { getByText, getByRole } = renderWithTheme(
      <FlowHeader steps={STEPS} title="MSA" meta="8 pages" onClose={onClose} />,
    );
    expect(getByText('MSA')).toBeInTheDocument();
    expect(getByText('8 pages')).toBeInTheDocument();
    fireEvent.click(getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders the right-hand actions', () => {
    const { getByRole } = renderWithTheme(
      <FlowHeader steps={STEPS}>
        <button type="button">Save draft</button>
      </FlowHeader>,
    );
    expect(getByRole('button', { name: 'Save draft' })).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(
      <FlowHeader steps={STEPS} title="MSA" onClose={() => {}} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
