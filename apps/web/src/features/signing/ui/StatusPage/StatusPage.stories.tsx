import type { Meta, StoryObj } from '@storybook/react-vite';
import { AlertCircle, Ban, CheckCircle2, Clock, Check } from 'lucide-react';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { StatusPage } from './StatusPage';

const meta: Meta<typeof StatusPage> = {
  title: 'L3/StatusPage',
  component: StatusPage,
  tags: ['autodocs', 'layer-3'],
  parameters: { layout: 'fullscreen', chromatic: { modes: chromaticViewportModes } },
};
export default meta;
type Story = StoryObj<typeof StatusPage>;

export const Signed: Story = { args: { tone: 'success', icon: Check, title: 'Signed' } };
export const AlreadySigned: Story = {
  args: { tone: 'ok', icon: CheckCircle2, title: 'Already signed' },
};
export const Expired: Story = { args: { tone: 'warn', icon: Clock, title: 'Link expired' } };
export const Invalid: Story = { args: { tone: 'bad', icon: AlertCircle, title: 'Link not valid' } };
export const Withdrawn: Story = {
  args: { tone: 'neutral', icon: Ban, title: 'Request withdrawn' },
};
