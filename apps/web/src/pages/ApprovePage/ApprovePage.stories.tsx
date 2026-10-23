import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router-dom';
import type { ApprovalCard } from 'shared';
import { ApprovalFrame } from '@/features/approvals/ApprovalFrame';
import {
  fakeCard,
  fakeSummary,
  KNOWN_RECIPIENTS,
  MANY_RECIPIENTS,
  NEW_RECIPIENT,
} from '@/features/approvals/fixtures';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { CardView } from './ApprovePage';

function noop(): void {
  /* story stub */
}

function Page({
  card,
  notice = null,
}: {
  readonly card: ApprovalCard;
  readonly notice?: string | null;
}) {
  return (
    <MemoryRouter>
      <ApprovalFrame title="Approve a request">
        <CardView
          card={card}
          busy={null}
          notice={notice}
          focusDeny={false}
          onDecide={noop}
          onReview={noop}
        />
      </ApprovalFrame>
    </MemoryRouter>
  );
}

const meta: Meta<typeof Page> = {
  title: 'L4/Approvals/ApprovePage',
  component: Page,
  tags: ['autodocs', 'layer-4'],
  parameters: {
    layout: 'fullscreen',
    chromatic: { modes: chromaticViewportModes },
  },
};
export default meta;
type Story = StoryObj<typeof Page>;

/** Every recipient known: Approve, Deny and Review fields. */
export const AllKnown: Story = { args: { card: fakeCard() } };

/** A new recipient: the main buttons are "Sign in to approve" and Deny. */
export const HasNewNeedsSignIn: Story = {
  args: {
    card: fakeCard({
      approve_requires: 'session',
      summary: fakeSummary({ recipients: [...KNOWN_RECIPIENTS, NEW_RECIPIENT] }),
    }),
  },
};

export const PlusMore: Story = {
  args: {
    card: fakeCard({
      approve_requires: 'session',
      summary: fakeSummary({ recipients: MANY_RECIPIENTS }),
    }),
  },
};

export const FieldsUpdated: Story = {
  args: { card: fakeCard({ fields_updated_at: '2026-10-22T09:21:00.000Z' }) },
};

export const SessionRequiredNotice: Story = {
  args: {
    card: fakeCard({ approve_requires: 'session' }),
    notice: 'This request needs you to sign in before it can be approved.',
  },
};

export const Done: Story = { args: { card: fakeCard({ state: 'done', csrf: undefined }) } };
export const Denied: Story = { args: { card: fakeCard({ state: 'denied', csrf: undefined }) } };
export const Expired: Story = { args: { card: { state: 'expired' } } };
export const Superseded: Story = { args: { card: { state: 'superseded' } } };
export const Failed: Story = {
  args: {
    card: fakeCard({ state: 'failed', result_slug: 'api_key_revoked', csrf: undefined }),
  },
};
