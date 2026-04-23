import type { Meta, StoryObj } from '@storybook/react';
import { EmailCard } from './EmailCard';
import { EmailMasthead } from '../EmailMasthead';

const meta: Meta<typeof EmailCard> = {
  title: 'L3/EmailCard',
  component: EmailCard,
  tags: ['autodocs', 'layer-3'],
};
export default meta;
type Story = StoryObj<typeof EmailCard>;

export const Default: Story = {
  render: () => (
    <div style={{ width: 640 }}>
      <EmailCard>
        <h2 style={{ margin: 0 }}>Please review this agreement</h2>
        <p style={{ margin: 0 }}>
          Lex & Finch — your landlord — has sent you a lease amendment to review and sign.
        </p>
      </EmailCard>
    </div>
  ),
};

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 16, width: 640 }}>
      <EmailMasthead brand="Seald" />
      <EmailCard>
        <h2 style={{ margin: 0 }}>Please review this agreement</h2>
        <p style={{ margin: 0 }}>Short body.</p>
      </EmailCard>
    </div>
  ),
};

export const Edge: Story = {
  render: () => (
    <div style={{ width: 640 }}>
      <EmailCard>
        <p>Minimal</p>
      </EmailCard>
    </div>
  ),
};
