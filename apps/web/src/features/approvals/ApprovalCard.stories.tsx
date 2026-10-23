import type { Meta, StoryObj } from '@storybook/react-vite';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { ApprovalCard } from './ApprovalCard';
import { fakeSummary, KNOWN_RECIPIENTS, MANY_RECIPIENTS, NEW_RECIPIENT } from './fixtures';

const meta: Meta<typeof ApprovalCard> = {
  title: 'L4/Approvals/ApprovalCard',
  component: ApprovalCard,
  tags: ['autodocs', 'layer-4'],
  parameters: {
    layout: 'padded',
    chromatic: { modes: chromaticViewportModes },
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof ApprovalCard>;

const IN_23H = new Date('2026-10-23T09:00:00.000Z').toISOString();

/** Every recipient is known: Approve is login-free, no New flag. */
export const AllKnown: Story = {
  args: { summary: fakeSummary(), expiresAt: IN_23H },
};

/** A new recipient sorts first and carries the New flag. */
export const HasNew: Story = {
  args: {
    summary: fakeSummary({ recipients: [...KNOWN_RECIPIENTS, NEW_RECIPIENT] }),
    expiresAt: IN_23H,
  },
};

/** More than three recipients: three, then "+2 more". */
export const PlusMoreCollapsed: Story = {
  args: { summary: fakeSummary({ recipients: MANY_RECIPIENTS }), expiresAt: IN_23H },
};

/** The same card with "+2 more" opened to the full list. */
export const PlusMoreExpanded: Story = {
  args: {
    summary: fakeSummary({ recipients: MANY_RECIPIENTS }),
    expiresAt: IN_23H,
    defaultExpanded: true,
  },
};

/** After the owner edited fields in Review. */
export const FieldsUpdated: Story = {
  args: {
    summary: fakeSummary({ recipients: [...KNOWN_RECIPIENTS, NEW_RECIPIENT] }),
    fieldsUpdatedAt: '2026-10-22T09:21:00.000Z',
    expiresAt: IN_23H,
  },
};

/** An action with no document and an external destination. */
export const WithDestination: Story = {
  args: {
    summary: fakeSummary({
      kind: 'automation_external_destination',
      action_label: 'Send completed documents to a webhook',
      title: null,
      recipients: [],
      page_count: null,
      key_name: 'Sent via API key',
      destination: { kind: 'webhook', label: 'hooks.example.test/seald' },
    }),
    expiresAt: IN_23H,
  },
};
