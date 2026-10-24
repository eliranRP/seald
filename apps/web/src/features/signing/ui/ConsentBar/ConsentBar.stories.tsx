import type { Meta, StoryObj } from '@storybook/react-vite';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { ConsentBar } from './ConsentBar';

const meta: Meta<typeof ConsentBar> = {
  title: 'L3/ConsentBar',
  component: ConsentBar,
  tags: ['autodocs', 'layer-3'],
  parameters: { layout: 'padded', chromatic: { modes: chromaticViewportModes } },
  args: {
    senderName: 'Eliran Azulay',
    fieldCount: 3,
    agreed: false,
    onAgreedChange: () => undefined,
    onStart: () => undefined,
    disclosureHref: '/legal/esign-disclosure',
    attestation: 'I can open and download a PDF on this device.',
  },
};
export default meta;
type Story = StoryObj<typeof ConsentBar>;

export const Unchecked: Story = {};
export const Checked: Story = { args: { agreed: true } };
export const Busy: Story = { args: { agreed: true, busy: true } };
