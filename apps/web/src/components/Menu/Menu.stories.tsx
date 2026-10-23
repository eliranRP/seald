import type { Meta, StoryObj } from '@storybook/react-vite';
import { Ban, Bell, Copy, Eye, Link, MoreHorizontal, Tag } from 'lucide-react';
import { MenuButton } from './Menu';

const meta: Meta<typeof MenuButton> = {
  title: 'L1/Menu',
  component: MenuButton,
  tags: ['autodocs', 'layer-1'],
};
export default meta;
type Story = StoryObj<typeof MenuButton>;

const noop = (): void => undefined;

export const RowActions: Story = {
  render: () => (
    <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 24, minHeight: 360 }}>
      <MenuButton
        aria-label="More actions for NDA.pdf"
        trigger={(p) => (
          <button type="button" aria-label="More actions" {...p}>
            <MoreHorizontal size={16} />
          </button>
        )}
        items={[
          { id: 'open', label: 'Open', icon: Eye, onSelect: noop },
          { id: 'remind', label: 'Remind all', icon: Bell, onSelect: noop },
          { id: 'link', label: 'Copy link', icon: Link, onSelect: noop },
          { id: 'dup', label: 'Duplicate', icon: Copy, onSelect: noop },
          { id: 'tag', label: 'Add tag', icon: Tag, onSelect: noop },
          { type: 'separator', id: 's' },
          { id: 'cancel', label: 'Cancel request', icon: Ban, danger: true, onSelect: noop },
        ]}
      />
    </div>
  ),
};

export const CheckedItems: Story = {
  render: () => (
    <div style={{ padding: 24, minHeight: 280 }}>
      <MenuButton
        aria-label="Updated"
        align="start"
        trigger={(p) => (
          <button type="button" {...p}>
            Any time
          </button>
        )}
        items={[
          { type: 'label', id: 'l', label: 'Updated' },
          { id: 'any', label: 'Any time', checked: true, onSelect: noop },
          { id: '7', label: 'Last 7 days', checked: false, onSelect: noop },
          { id: '30', label: 'Last 30 days', checked: false, onSelect: noop },
        ]}
      />
    </div>
  ),
};
