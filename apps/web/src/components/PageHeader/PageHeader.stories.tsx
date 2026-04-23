import type { Meta, StoryObj } from '@storybook/react';
import { PageHeader } from './PageHeader';

const meta: Meta<typeof PageHeader> = {
  title: 'L2/PageHeader',
  component: PageHeader,
  tags: ['autodocs', 'layer-2'],
  args: { eyebrow: 'Documents', title: "Everything you've sent" },
};
export default meta;
type Story = StoryObj<typeof PageHeader>;

export const Default: Story = {};

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 32, width: 900 }}>
      <PageHeader eyebrow="Documents" title="Everything you've sent" />
      <PageHeader title="Just a title" />
      <PageHeader
        eyebrow="Signers"
        title="People you send documents to"
        actions={<button type="button">Add signer</button>}
      />
    </div>
  ),
};

export const Edge: Story = {
  render: () => (
    <PageHeader
      eyebrow="Long eyebrow copy"
      title="A very long page title that might eventually wrap to two lines under narrower viewports"
      actions={<button type="button">Action</button>}
    />
  ),
};
