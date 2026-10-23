import type { Meta, StoryObj } from '@storybook/react-vite';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { SignHeader } from './SignHeader';

const meta: Meta<typeof SignHeader> = {
  title: 'L3/SignHeader',
  component: SignHeader,
  tags: ['autodocs', 'layer-3'],
  parameters: { layout: 'fullscreen', chromatic: { modes: chromaticViewportModes } },
};
export default meta;
type Story = StoryObj<typeof SignHeader>;

export const LogoOnly: Story = {};

export const WithDocument: Story = {
  args: {
    title: 'NDA — Quill Capital',
    senderName: 'Eliran Azulay',
    onDownload: () => undefined,
    menu: [
      { id: 'decline', label: 'Decline', onSelect: () => undefined },
      { id: 'withdraw', label: 'Withdraw consent', danger: true, onSelect: () => undefined },
    ],
  },
};
