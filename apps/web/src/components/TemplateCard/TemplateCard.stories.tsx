import type { Meta, StoryObj } from '@storybook/react-vite';
import { SAMPLE_TEMPLATES as TEMPLATES } from '@/test/templateFixtures';
import { TemplateCard } from './TemplateCard';

function noop(): void {
  /* storybook stub */
}

const SAMPLE_WITH_TAGS = {
  ...TEMPLATES[0]!,
  tags: ['Construction', 'Legal'],
};

const meta: Meta<typeof TemplateCard> = {
  title: 'L2/TemplateCard',
  component: TemplateCard,
  tags: ['autodocs', 'layer-2'],
  parameters: { layout: 'padded' },
  args: {
    template: SAMPLE_WITH_TAGS,
    onUse: noop,
    onEdit: noop,
    onDelete: noop,
    onTagClick: noop,
    onEditTags: noop,
  },
};
export default meta;
type Story = StoryObj<typeof TemplateCard>;

export const Default: Story = {};

export const NoTags: Story = {
  name: 'No tags attached',
  args: { template: TEMPLATES[1]! },
};

export const ManyTags: Story = {
  name: 'Tag overflow (+N pill)',
  args: {
    template: { ...TEMPLATES[2]!, tags: ['Legal', 'HR', 'Construction', 'Sales'] },
  },
};

export const UseOnly: Story = {
  name: 'Use-only (no Edit / Delete)',
  args: { onEdit: undefined, onDelete: undefined, onEditTags: undefined },
};

export const Grid: Story = {
  name: 'Four cards in a responsive grid',
  render: (args) => (
    <div
      style={{
        display: 'grid',
        gap: 18,
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
      }}
    >
      {TEMPLATES.map((t, i) => (
        <TemplateCard
          key={t.id}
          {...args}
          template={{
            ...t,
            tags:
              i === 0
                ? ['Construction', 'Legal']
                : i === 1
                  ? ['Legal', 'Sales']
                  : i === 2
                    ? ['HR', 'Legal']
                    : ['Marketing'],
          }}
        />
      ))}
    </div>
  ),
};
