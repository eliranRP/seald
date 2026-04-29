import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import type { JSX } from 'react';
import { PlaceOnPagesPopover } from './PlaceOnPagesPopover';
import type { PlacePagesMode } from './PlaceOnPagesPopover.types';

const meta: Meta<typeof PlaceOnPagesPopover> = {
  title: 'L3/PlaceOnPagesPopover',
  component: PlaceOnPagesPopover,
  tags: ['autodocs', 'layer-3'],
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof PlaceOnPagesPopover>;

const noop = (): void => {};

export const Closed: Story = {
  render: () => (
    <PlaceOnPagesPopover
      open={false}
      currentPage={1}
      totalPages={5}
      onApply={noop}
      onCancel={noop}
    />
  ),
};

export const OpenAllMode: Story = {
  render: () => (
    <PlaceOnPagesPopover
      open
      currentPage={2}
      totalPages={5}
      initialMode="all"
      onApply={noop}
      onCancel={noop}
    />
  ),
};

export const OpenCustomMode: Story = {
  render: () => (
    <PlaceOnPagesPopover
      open
      currentPage={3}
      totalPages={8}
      initialMode="custom"
      onApply={noop}
      onCancel={noop}
    />
  ),
};

function PlaygroundDemo(): JSX.Element {
  const [open, setOpen] = useState<boolean>(true);
  const [lastApplied, setLastApplied] = useState<string>('');

  const handleApply = (mode: PlacePagesMode, customPages?: ReadonlyArray<number>): void => {
    const pages = customPages ? ` [${customPages.join(', ')}]` : '';
    setLastApplied(`${mode}${pages}`);
    setOpen(false);
  };

  return (
    <div style={{ padding: 32, fontFamily: 'Inter, sans-serif' }}>
      <button type="button" onClick={() => setOpen(true)}>
        Open popover
      </button>
      <div style={{ marginTop: 12, fontSize: 14 }}>Last applied: {lastApplied || '(none)'}</div>
      <PlaceOnPagesPopover
        open={open}
        currentPage={2}
        totalPages={6}
        initialMode="all"
        onApply={handleApply}
        onCancel={() => setOpen(false)}
      />
    </div>
  );
}

export const Playground: Story = {
  render: () => <PlaygroundDemo />,
};
