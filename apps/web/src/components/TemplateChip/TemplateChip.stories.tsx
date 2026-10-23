import type { Meta, StoryObj } from '@storybook/react-vite';
import { TemplateChip } from './TemplateChip';

const meta: Meta<typeof TemplateChip> = {
  title: 'L1/TemplateChip',
  component: TemplateChip,
  tags: ['autodocs', 'layer-1'],
  args: { name: 'NDA — mutual', signers: 2 },
};
export default meta;
type Story = StoryObj<typeof TemplateChip>;

export const Default: Story = {};
export const NoCount: Story = { args: { signers: undefined } };
