import type { Meta, StoryObj } from '@storybook/react-vite';
import { TEMPLATES } from '@/features/templates';
import { TemplateCard } from './TemplateCard';

function noop(): void {
  /* storybook stub */
}

const meta: Meta<typeof TemplateCard> = {
  title: 'L2/TemplateCard',
  component: TemplateCard,
  tags: ['autodocs', 'layer-2'],
  parameters: { layout: 'padded' },
  args: {
    template: TEMPLATES[0]!,
    onUse: noop,
    onEdit: noop,
  },
};
export default meta;
type Story = StoryObj<typeof TemplateCard>;

export const Default: Story = {};

export const WithoutEdit: Story = {
  name: 'Use-only (no Edit action)',
  args: { onEdit: undefined },
};

export const Grid: Story = {
  name: 'Four cards in a responsive grid',
  render: (args) => (
    <div
      style={{
        display: 'grid',
        gap: 20,
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
      }}
    >
      {TEMPLATES.map((t) => (
        <TemplateCard key={t.id} {...args} template={t} />
      ))}
    </div>
  ),
};
