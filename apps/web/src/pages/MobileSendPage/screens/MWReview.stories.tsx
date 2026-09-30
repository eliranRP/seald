import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import type { MobileSigner } from '../types';
import { MWReview } from './MWReview';

const SIGNERS: ReadonlyArray<MobileSigner> = [
  {
    id: 'signer-maya',
    name: 'Maya Lin',
    email: 'maya@example.com',
    color: '#4F46E5',
    initials: 'ML',
  },
];

function ReviewFrame({ enabled }: { readonly enabled: boolean }) {
  const [on, setOn] = useState(enabled);
  return (
    <MWReview
      title="Master Services Agreement"
      onTitle={() => undefined}
      signers={SIGNERS}
      fields={[]}
      fileName="msa.pdf"
      totalPages={4}
      remindersEnabled={on}
      onRemindersEnabledChange={setOn}
    />
  );
}

const meta: Meta<typeof MWReview> = {
  title: 'L4/MWReview',
  component: MWReview,
  tags: ['autodocs', 'layer-4'],
  parameters: { layout: 'fullscreen', chromatic: { modes: chromaticViewportModes } },
};
export default meta;
type Story = StoryObj<typeof MWReview>;

export const Mobile: Story = {
  parameters: { chromatic: { modes: { mobile: chromaticViewportModes.mobile } } },
  render: () => <ReviewFrame enabled />,
};

export const Desktop: Story = {
  parameters: { chromatic: { modes: { desktop: chromaticViewportModes.desktop } } },
  render: () => <ReviewFrame enabled={false} />,
};
