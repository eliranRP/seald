import type { Meta, StoryObj } from '@storybook/react-vite';
import { CodeSnippet } from './CodeSnippet';

const meta: Meta<typeof CodeSnippet> = {
  title: 'L1/CodeSnippet',
  component: CodeSnippet,
  tags: ['autodocs', 'layer-1'],
  args: {
    label: 'Claude Code command',
    code: 'claude mcp add --transport http seald https://api.seald.nromomentum.com/mcp',
  },
};
export default meta;
type Story = StoryObj<typeof CodeSnippet>;

export const Default: Story = {};

export const MultiLine: Story = {
  args: {
    label: 'JSON config',
    code: '{\n  "mcpServers": {\n    "seald": { "url": "https://api.seald.nromomentum.com/mcp" }\n  }\n}',
  },
};
