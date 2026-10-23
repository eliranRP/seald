import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { ENVELOPE_ID, fakeEnvelope } from '../fixtures';
import { ApprovalReview } from './ApprovalReview';
import { reviewPdfKey } from './useReviewPdfUrl';

function noop(): void {
  /* story stub */
}

// An empty PDF url keeps the stories off the network: the page canvas shows
// its placeholder and the field boxes still sit on it.
function Seeded({ children }: { readonly children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  qc.setQueryData(reviewPdfKey(ENVELOPE_ID, 'd1'), '');
  qc.setQueryData(reviewPdfKey(ENVELOPE_ID, 'd2'), '');
  qc.setQueryData(reviewPdfKey(ENVELOPE_ID, undefined), '');
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const meta: Meta<typeof ApprovalReview> = {
  title: 'L4/Approvals/ApprovalReview',
  component: ApprovalReview,
  tags: ['autodocs', 'layer-4'],
  parameters: {
    layout: 'fullscreen',
    chromatic: { modes: chromaticViewportModes },
  },
  decorators: [
    (Story) => (
      <Seeded>
        <Story />
      </Seeded>
    ),
  ],
  args: {
    envelope: fakeEnvelope(),
    actionLabel: 'Send for signature',
    step: 1,
    onStepChange: noop,
    onApprove: noop,
    onEdit: noop,
    onExit: noop,
    busy: false,
    isMobile: false,
  },
};
export default meta;
type Story = StoryObj<typeof ApprovalReview>;

/** Desktop: legend on the left, page rail on the right, Back / Next in the bar. */
export const DesktopPage: Story = {};

export const DesktopSecondDocument: Story = { args: { step: 3 } };

export const DesktopSummary: Story = { args: { step: 4 } };

/** Phone: arrows in the header, swipe, the page full width. */
export const MobilePage: Story = { args: { isMobile: true, onEdit: undefined } };

/** Phone: the summary opens as a bottom sheet over the last page. */
export const MobileSummarySheet: Story = { args: { isMobile: true, step: 4, onEdit: undefined } };

export const SignInAgainNotice: Story = {
  args: { notice: 'Approving needs a sign-in from the last 12 hours.' },
};

export const Approving: Story = { args: { busy: true } };
