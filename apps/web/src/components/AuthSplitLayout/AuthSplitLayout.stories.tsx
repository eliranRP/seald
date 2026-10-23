import type { Meta, StoryObj } from '@storybook/react-vite';
import { AuthSplitLayout } from './AuthSplitLayout';

const meta: Meta<typeof AuthSplitLayout> = {
  title: 'L3/AuthSplitLayout',
  component: AuthSplitLayout,
  tags: ['autodocs', 'layer-3'],
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof AuthSplitLayout>;

export const Default: Story = {
  render: () => (
    <AuthSplitLayout>
      <h1 style={{ margin: 0 }}>Sign in or create account</h1>
    </AuthSplitLayout>
  ),
};

export const WithoutPanel: Story = {
  render: () => (
    <AuthSplitLayout hidePanel>
      <h1 style={{ margin: 0 }}>Check your email</h1>
    </AuthSplitLayout>
  ),
};
