import type { Meta, StoryObj } from '@storybook/react-vite';
import { TemplateFlowHeader } from './TemplateFlowHeader';

const meta: Meta<typeof TemplateFlowHeader> = {
  title: 'L1/TemplateFlowHeader',
  component: TemplateFlowHeader,
  tags: ['autodocs', 'layer-1'],
  parameters: { layout: 'fullscreen' },
  args: {
    templateName: 'NDA — standard',
    meta: '3 pages',
    onCancel: () => undefined,
  },
};
export default meta;

type Story = StoryObj<typeof TemplateFlowHeader>;

export const Editing: Story = {
  args: { mode: 'editing', onSave: () => undefined, onRenameTemplate: () => undefined },
};

export const New: Story = {
  args: { mode: 'new', templateName: 'Untitled template', onSave: () => undefined },
};

export const FromTemplate: Story = {
  args: { mode: 'using' },
};

export const Saving: Story = {
  args: { mode: 'editing', onSave: () => undefined, saving: true },
};
