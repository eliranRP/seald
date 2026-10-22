import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { renderWithTheme } from '../../test/renderWithTheme';
import { RunList } from './RunList';
import type { RunListItem } from './RunList.types';

const noop = (): void => undefined;

function renderRuns(
  runs: readonly RunListItem[],
  extra: Partial<Parameters<typeof RunList>[0]> = {},
) {
  return renderWithTheme(<RunList runs={runs} onRetry={noop} onFix={noop} {...extra} />);
}

describe('RunList', () => {
  it('shows the empty text with no runs', () => {
    renderRuns([]);
    expect(screen.getByText('No runs yet.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('shows no status word for queued and running runs', () => {
    renderRuns([
      { id: '1', title: 'Run one', when: 'Now', status: 'queued' },
      { id: '2', title: 'Run two', when: 'Now', status: 'running' },
    ]);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(within(item).queryByText(/Retrying|Done|Failed/)).toBeNull();
    }
  });

  it('shows Retrying with the attempt count', () => {
    renderRuns([
      { id: '1', title: 'Hook', when: 'Now', status: 'retrying', attempt: 2, maxAttempts: 8 },
    ]);
    expect(screen.getByText('Retrying')).toBeInTheDocument();
    expect(screen.getByText(/attempt 2 of 8/)).toBeInTheDocument();
  });

  it('shows Done for a success', () => {
    renderRuns([{ id: '1', title: 'Hook', when: 'Now', status: 'succeeded' }]);
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('offers Retry for a retryable failure', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderRuns(
      [
        {
          id: 'r1',
          title: 'Hook',
          when: 'Now',
          status: 'failed',
          retryable: true,
          reason: 'The site returned 404',
        },
      ],
      { onRetry },
    );
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('The site returned 404')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Fix/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Retry Hook' }));
    expect(onRetry).toHaveBeenCalledWith('r1');
  });

  it('offers Fix for a permanent failure', async () => {
    const user = userEvent.setup();
    const onFix = vi.fn();
    renderRuns([{ id: 'f1', title: 'Drive', when: 'Now', status: 'failed', retryable: false }], {
      onFix,
    });
    expect(screen.queryByRole('button', { name: /^Retry/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Fix Drive' }));
    expect(onFix).toHaveBeenCalledWith('f1');
  });

  it('loads more when asked', async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn();
    renderRuns([{ id: '1', title: 'Hook', when: 'Now', status: 'succeeded' }], {
      hasMore: true,
      onLoadMore,
    });
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });
});
