import type { Meta, StoryObj } from '@storybook/react-vite';
import { AuthShell } from './AuthShell';

const meta: Meta<typeof AuthShell> = {
  title: 'L3/AuthShell',
  component: AuthShell,
  tags: ['autodocs', 'layer-3'],
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof AuthShell>;

export const Default: Story = {
  render: () => (
    <AuthShell>
      <div style={{ padding: 16 }}>
        <h1 style={{ fontFamily: "'Source Serif 4', serif", fontSize: 36, margin: 0 }}>
          Welcome back
        </h1>
        <p style={{ marginTop: 8, fontSize: 14, color: '#6B7280' }}>
          Sign in to pick up where you left off.
        </p>
      </div>
    </AuthShell>
  ),
};

export const Compact: Story = {
  render: () => (
    <AuthShell compact>
      <div style={{ padding: 16 }}>
        <h1 style={{ fontFamily: "'Source Serif 4', serif", fontSize: 28, margin: 0 }}>
          Check your email
        </h1>
      </div>
    </AuthShell>
  ),
};
