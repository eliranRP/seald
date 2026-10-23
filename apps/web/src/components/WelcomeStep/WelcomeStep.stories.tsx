import type { Meta, StoryObj } from '@storybook/react-vite';
import { WelcomeStep } from './WelcomeStep';

const meta: Meta<typeof WelcomeStep> = {
  title: 'L3/WelcomeStep',
  component: WelcomeStep,
  tags: ['autodocs', 'layer-3'],
  parameters: { layout: 'centered' },
  args: {
    email: 'hannah@quill.vc',
    onSubmit: async () => undefined,
  },
};
export default meta;
type Story = StoryObj<typeof WelcomeStep>;

export const Default: Story = {};
export const PrefilledFromGoogle: Story = { args: { initialName: 'Hannah Wills' } };
export const SaveFails: Story = {
  args: {
    initialName: 'Hannah Wills',
    onSubmit: async () => {
      throw new Error('Could not save your profile. Try again.');
    },
  },
};
