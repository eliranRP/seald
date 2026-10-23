import type { Meta, StoryObj } from '@storybook/react-vite';
import { RunList } from './RunList';
import type { RunListItem } from './RunList.types';

const RUNS: readonly RunListItem[] = [
  { id: '1', title: 'Save to Drive', when: 'Today, 14:02', status: 'queued' },
  { id: '2', title: 'Save to Drive', when: 'Today, 13:40', status: 'running' },
  {
    id: '3',
    title: 'Webhook',
    when: 'Today, 12:10',
    status: 'retrying',
    attempt: 3,
    maxAttempts: 8,
  },
  { id: '4', title: 'Webhook', when: 'Yesterday', status: 'succeeded' },
  {
    id: '5',
    title: 'Webhook',
    when: 'Yesterday',
    status: 'failed',
    retryable: true,
    reason: 'The site returned 404',
  },
  {
    id: '6',
    title: 'Save to Drive',
    when: 'Mon',
    status: 'failed',
    retryable: false,
    reason: 'Drive needs to be reconnected',
  },
];

const meta: Meta<typeof RunList> = {
  title: 'L2/RunList',
  component: RunList,
  tags: ['autodocs', 'layer-2'],
  args: { runs: RUNS, onRetry: () => undefined, onFix: () => undefined },
};
export default meta;
type Story = StoryObj<typeof RunList>;

export const Default: Story = {};

export const WithLoadMore: Story = { args: { hasMore: true, onLoadMore: () => undefined } };

export const Empty: Story = { args: { runs: [] } };
