import type { Meta, StoryObj } from '@storybook/react-vite';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';

const meta: Meta<typeof PasswordStrengthMeter> = {
  title: 'L1/PasswordStrengthMeter',
  component: PasswordStrengthMeter,
  tags: ['autodocs', 'layer-1'],
  args: { level: 0 },
  decorators: [
    (Story) => (
      <div style={{ width: 280 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof PasswordStrengthMeter>;

export const TooShort: Story = {
  args: { level: 0 },
};

export const Weak: Story = {
  args: { level: 1 },
};

export const Okay: Story = {
  args: { level: 2 },
};

export const Strong: Story = {
  args: { level: 3 },
};

export const Excellent: Story = {
  args: { level: 4 },
};
