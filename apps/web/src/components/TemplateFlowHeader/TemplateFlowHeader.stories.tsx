import type { Meta, StoryObj } from '@storybook/react-vite';
import { TemplateFlowHeader } from './TemplateFlowHeader';

const meta: Meta<typeof TemplateFlowHeader> = {
  title: 'L2 / TemplateFlowHeader',
  component: TemplateFlowHeader,
  parameters: { layout: 'fullscreen' },
};
export default meta;

type Story = StoryObj<typeof TemplateFlowHeader>;

const baseArgs = {
  step: 1 as const,
  templateName: 'Mutual NDA — short form',
  onBack: () => {
    /* storybook noop */
  },
  onCancel: () => {
    /* storybook noop */
  },
};

export const UsingStep1: Story = {
  args: { ...baseArgs, mode: 'using', step: 1 },
};

export const UsingStep2: Story = {
  args: { ...baseArgs, mode: 'using', step: 2 },
};

export const UsingStep3: Story = {
  args: { ...baseArgs, mode: 'using', step: 3 },
};

export const NewStep1: Story = {
  args: { ...baseArgs, mode: 'new', templateName: 'New template', step: 1 },
};

export const Editable: Story = {
  args: {
    ...baseArgs,
    mode: 'using',
    step: 1,
    onRenameTemplate: (next: string) => {
      /* eslint-disable-next-line no-console */
      console.log('rename to', next);
    },
  },
};
