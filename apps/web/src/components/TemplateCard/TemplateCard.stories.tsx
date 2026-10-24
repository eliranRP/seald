import type { Meta, StoryObj } from '@storybook/react-vite';
import type { TemplateSummary } from '@/features/templates';
import { TemplateCard } from './TemplateCard';

function noop(): void {
  /* storybook stub */
}

const TEMPLATE: TemplateSummary = {
  id: 'tpl-nda',
  name: 'NDA — standard',
  pages: 3,
  fieldCount: 4,
  lastUsed: '10/20/2026',
  lastUsedAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
  uses: 12,
  cover: '#EEF2FF',
  exampleFile: '',
  fields: [],
  tags: ['Legal'],
  lastSigners: [
    { id: 'c1', name: 'Hannah Wills', email: 'hannah@quill.vc', color: '#7DD3FC' },
    { id: 'c2', name: 'Eliran Azulay', email: 'eliran@seald.app', color: '#F472B6' },
  ],
};

const meta: Meta<typeof TemplateCard> = {
  title: 'L2/TemplateCard',
  component: TemplateCard,
  tags: ['autodocs', 'layer-2'],
  parameters: { layout: 'padded' },
  args: {
    template: TEMPLATE,
    onUse: noop,
    onEdit: noop,
    onDuplicate: noop,
    onEditTags: noop,
    onDelete: noop,
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 280, minHeight: 320 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof TemplateCard>;

export const Tile: Story = {};

export const NeverUsed: Story = {
  args: { template: { ...TEMPLATE, uses: 0, lastUsedAt: null } },
};

export const Row: Story = {
  args: { compact: true, onMore: noop },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 358 }}>
        <Story />
      </div>
    ),
  ],
};
