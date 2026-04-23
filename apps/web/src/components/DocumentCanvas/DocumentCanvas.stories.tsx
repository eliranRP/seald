import type { Meta, StoryObj } from '@storybook/react';
import { DocumentCanvas } from './DocumentCanvas';

const meta: Meta<typeof DocumentCanvas> = {
  title: 'L3/DocumentCanvas',
  component: DocumentCanvas,
  tags: ['autodocs', 'layer-3'],
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof DocumentCanvas>;

export const FirstPage: Story = {
  render: () => <DocumentCanvas currentPage={1} totalPages={4} />,
};

export const LastPage: Story = {
  render: () => <DocumentCanvas currentPage={4} totalPages={4} />,
};

export const CustomTitle: Story = {
  render: () => (
    <DocumentCanvas
      currentPage={1}
      totalPages={2}
      title="Non-Disclosure Agreement"
      docId="DOC-NDA-0042"
    />
  ),
};

export const WithPlacedField: Story = {
  render: () => (
    <DocumentCanvas currentPage={2} totalPages={2}>
      <div
        style={{
          position: 'absolute',
          left: 96,
          top: 220,
          width: 132,
          height: 54,
          border: '1.5px dashed #6366F1',
          background: 'rgba(99,102,241,0.08)',
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          fontWeight: 600,
          color: '#4338CA',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        Signature
      </div>
    </DocumentCanvas>
  ),
};
