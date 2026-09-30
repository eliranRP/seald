import type { Meta, StoryObj } from '@storybook/react-vite';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { CodeSnippet } from './CodeSnippet';

const meta: Meta<typeof CodeSnippet> = {
  title: 'L1/CodeSnippet',
  component: CodeSnippet,
  tags: ['autodocs', 'layer-1'],
  parameters: { chromatic: { modes: chromaticViewportModes } },
  args: {
    label: 'Cursor',
    code: '{\n  "url": "https://api.seald.nromomentum.com/mcp"\n}',
  },
};
export default meta;
type Story = StoryObj<typeof CodeSnippet>;

export const Mobile: Story = {
  parameters: { chromatic: { modes: { mobile: chromaticViewportModes.mobile } } },
};

export const Desktop: Story = {
  parameters: { chromatic: { modes: { desktop: chromaticViewportModes.desktop } } },
};
