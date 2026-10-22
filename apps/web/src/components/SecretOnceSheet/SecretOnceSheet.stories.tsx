import type { Meta, StoryObj } from '@storybook/react-vite';
import { CodeSnippet } from '../CodeSnippet';
import { SecretOnceSheet } from './SecretOnceSheet';

const meta: Meta<typeof SecretOnceSheet> = {
  title: 'L3/SecretOnceSheet',
  component: SecretOnceSheet,
  tags: ['autodocs', 'layer-3'],
  parameters: { layout: 'fullscreen' },
  args: {
    open: true,
    onClose: () => undefined,
    title: 'Your new key',
    description: 'Copy it now. It is shown once.',
    secret: 'seald_live_EXAMPLEEXAMPLEEXAMPLEEXAMPLE0000',
  },
};
export default meta;
type Story = StoryObj<typeof SecretOnceSheet>;

export const Default: Story = {};

export const WithSnippet: Story = {
  render: (args) => (
    <SecretOnceSheet {...args}>
      <CodeSnippet label="Claude Code command" code="claude mcp add seald" />
    </SecretOnceSheet>
  ),
};
