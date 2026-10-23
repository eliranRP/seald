import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router-dom';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { BatchTable } from './BatchTable';
import { fakeFinishedWithFailure, fakePreviewWithProblems } from './fixtures';

const meta: Meta<typeof BatchTable> = {
  title: 'L3/BulkSend/BatchTable',
  component: BatchTable,
  tags: ['autodocs', 'layer-3'],
  parameters: {
    layout: 'padded',
    chromatic: { modes: chromaticViewportModes },
  },
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof BatchTable>;

export const Preview: Story = {
  args: {
    mode: 'preview',
    caption: 'Rows from tenants.csv',
    rows: fakePreviewWithProblems().rows,
  },
};

export const Results: Story = {
  args: {
    mode: 'progress',
    caption: 'Results from tenants.csv',
    rows: fakeFinishedWithFailure().rows,
  },
};
