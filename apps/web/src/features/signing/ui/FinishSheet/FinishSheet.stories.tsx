import type { Meta, StoryObj } from '@storybook/react-vite';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { FinishSheet } from './FinishSheet';

const meta: Meta<typeof FinishSheet> = {
  title: 'L3/FinishSheet',
  component: FinishSheet,
  tags: ['autodocs', 'layer-3'],
  parameters: { layout: 'fullscreen', chromatic: { modes: chromaticViewportModes } },
  args: {
    open: true,
    onClose: () => undefined,
    docTitle: 'NDA — Quill Capital',
    signerName: 'Hannah Wills',
    signerEmail: 'hannah@quill.vc',
    preview: <span style={{ fontFamily: 'Caveat, cursive', fontSize: 44 }}>Hannah Wills</span>,
    onSign: () => undefined,
  },
};
export default meta;
type Story = StoryObj<typeof FinishSheet>;

export const Default: Story = {};
export const Busy: Story = { args: { busy: true } };
