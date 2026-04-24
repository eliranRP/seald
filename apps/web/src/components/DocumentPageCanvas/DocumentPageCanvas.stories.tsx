import type { Meta, StoryObj } from '@storybook/react';
import { DocumentPageCanvas } from './DocumentPageCanvas';

const meta: Meta<typeof DocumentPageCanvas> = {
  title: 'L2/DocumentPageCanvas',
  component: DocumentPageCanvas,
  tags: ['autodocs', 'layer-2'],
  parameters: { layout: 'centered' },
  args: { pageNum: 1, totalPages: 4, title: 'Master Services Agreement' },
};
export default meta;
type Story = StoryObj<typeof DocumentPageCanvas>;

export const Default: Story = {};

export const WithFields: Story = {
  render: (args) => (
    <DocumentPageCanvas {...args}>
      <div
        style={{
          position: 'absolute',
          left: 60,
          top: 560,
          width: 200,
          height: 54,
          border: '1.5px dashed rgb(99, 102, 241)',
          borderRadius: 8,
          background: 'rgba(99,102,241,0.12)',
          display: 'inline-flex',
          alignItems: 'center',
          padding: '0 10px',
          fontSize: 11,
          fontWeight: 600,
          color: 'rgb(79, 70, 229)',
        }}
      >
        Sign as Counterparty *
      </div>
    </DocumentPageCanvas>
  ),
};

export const Mobile: Story = {
  args: { width: 320 },
  parameters: { viewport: { defaultViewport: 'iphonex' } },
  render: (args) => (
    <div style={{ width: 360, padding: 16 }}>
      <DocumentPageCanvas {...args} />
    </div>
  ),
};
