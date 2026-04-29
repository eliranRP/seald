import type { Meta, StoryObj } from '@storybook/react-vite';
import { RecipientHeader } from './RecipientHeader';

const meta: Meta<typeof RecipientHeader> = {
  title: 'L2/RecipientHeader',
  component: RecipientHeader,
  tags: ['autodocs', 'layer-2'],
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof RecipientHeader>;

export const Default: Story = {
  render: () => (
    <RecipientHeader
      docTitle="Master Services Agreement"
      docId="ABC-123"
      senderName="Jamie Okonkwo"
      stepLabel="Step 2 of 4"
      onExit={() => {
        /* story stub */
      }}
    />
  ),
};

export const NoSender: Story = {
  render: () => (
    <RecipientHeader
      docTitle="Master Services Agreement"
      docId="ABC-123"
      stepLabel="Step 2 of 4"
      onExit={() => {
        /* story stub */
      }}
    />
  ),
};

export const NoStep: Story = {
  render: () => (
    <RecipientHeader
      docTitle="Master Services Agreement"
      docId="ABC-123"
      senderName="Jamie Okonkwo"
      onExit={() => {
        /* story stub */
      }}
    />
  ),
};

export const NoExit: Story = {
  render: () => (
    <RecipientHeader
      docTitle="Master Services Agreement"
      docId="ABC-123"
      senderName="Jamie Okonkwo"
      stepLabel="Step 2 of 4"
    />
  ),
};

export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: 'iphonex' } },
  render: () => (
    // The viewport addon may not be configured in this Storybook; the wrapping
    // 375px div is a safety net so the mobile framing is visible regardless.
    <div style={{ width: 375, maxWidth: '100%', border: '1px dashed transparent' }}>
      <RecipientHeader
        docTitle="Master Services Agreement for Acme Corp — Amendment #3"
        docId="ABC-123"
        senderName="Jamie Okonkwo"
        stepLabel="Step 2 of 4"
        onExit={() => {
          /* story stub */
        }}
      />
    </div>
  ),
};
