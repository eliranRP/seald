import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '@/test/renderWithTheme';
import { MiniTrack } from './MiniTrack';

const STEPS = [
  { label: 'Sent', state: 'done' },
  { label: 'Opened', state: 'now' },
  { label: 'Signed', state: 'todo' },
] as const;

describe('MiniTrack', () => {
  it('renders a named list with one spoken item per step', () => {
    const { getByRole, getAllByRole } = renderWithTheme(
      <MiniTrack aria-label="Progress for Maya Chen" steps={STEPS} />,
    );
    expect(getByRole('list', { name: 'Progress for Maya Chen' })).toBeInTheDocument();
    const items = getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      'Sent: done',
      'Opened: in progress',
      'Signed: not yet',
    ]);
  });

  it('marks dot states for styling', () => {
    const { container } = renderWithTheme(
      <MiniTrack
        aria-label="Track"
        steps={[
          { label: 'Sent', state: 'done' },
          { label: 'Opened', state: 'bad' },
          { label: 'Signed', state: 'off' },
        ]}
      />,
    );
    const states = Array.from(container.querySelectorAll('[data-state]')).map((el) =>
      el.getAttribute('data-state'),
    );
    expect(states).toEqual(['done', 'bad', 'off']);
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(<MiniTrack aria-label="Track" steps={STEPS} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
