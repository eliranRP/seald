import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { ApprovalReview } from '@/features/approvals/review/ApprovalReview';
import { reviewPdfKey } from '@/features/approvals/review/useReviewPdfUrl';
import { ENVELOPE_ID, fakeEnvelope } from '@/features/approvals/fixtures';
import { ReviewPlacement } from './ReviewPlacement';

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
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

// The button needs the MCP server flag; stories turn it on through the
// documented test override.
interface OverrideHost {
  __SEALD_FEATURE_OVERRIDES__?: Record<string, boolean>;
}
function withFlags(flags: Record<string, boolean>): void {
  (globalThis as OverrideHost).__SEALD_FEATURE_OVERRIDES__ = flags;
}

const meta: Meta<typeof ReviewPlacement> = {
  title: 'L4/Envelope/ReviewPlacement',
  component: ReviewPlacement,
  tags: ['autodocs', 'layer-4'],
  parameters: { layout: 'padded', chromatic: { modes: chromaticViewportModes } },
};
export default meta;
type Story = StoryObj<typeof ReviewPlacement>;

/** The one tap, on a draft an agent prepared. */
export const Button: Story = {
  render: () => {
    withFlags({ mcpServer: true });
    return (
      <Seeded>
        <ReviewPlacement envelope={fakeEnvelope()} />
      </Seeded>
    );
  },
};

/** Flag off, or not a draft: nothing renders. */
export const Hidden: Story = {
  render: () => {
    withFlags({});
    return (
      <Seeded>
        <ReviewPlacement envelope={fakeEnvelope()} />
        <p>Nothing renders above this line.</p>
      </Seeded>
    );
  },
};

const REVIEW_ARGS = {
  envelope: fakeEnvelope(),
  actionLabel: 'Send for signature',
  step: 1,
  onStepChange: noop,
  onApprove: noop,
  onExit: noop,
  busy: false,
  approveLabel: 'Send',
  backLabel: 'Close the review',
} as const;

/** What the button opens, on a desktop: Send and Edit in the bar. */
export const OpenDesktop: Story = {
  render: () => (
    <Seeded>
      <ApprovalReview {...REVIEW_ARGS} onEdit={noop} isMobile={false} />
    </Seeded>
  ),
};

/** On a phone: no Edit, the summary opens as a sheet at the end. */
export const OpenMobile: Story = {
  render: () => (
    <Seeded>
      <ApprovalReview {...REVIEW_ARGS} step={4} isMobile />
    </Seeded>
  ),
};

/** A refused send keeps the owner in the review with the reason. */
export const SendRefused: Story = {
  render: () => (
    <Seeded>
      <ApprovalReview
        {...REVIEW_ARGS}
        onEdit={noop}
        isMobile={false}
        notice="Every signer needs a signature field. Choose Edit to add one."
      />
    </Seeded>
  ),
};
