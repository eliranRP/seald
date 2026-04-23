import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { CollapsibleRail } from '../CollapsibleRail';
import { FieldPalette } from './FieldPalette';
import { FIELD_KINDS } from '../../types/sealdTypes';

const meta: Meta<typeof FieldPalette> = {
  title: 'L3/FieldPalette',
  component: FieldPalette,
  tags: ['autodocs', 'layer-3'],
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof FieldPalette>;

export const Default: Story = {
  render: () => (
    <div style={{ maxWidth: 280 }}>
      <FieldPalette onFieldDragStart={() => {}} onFieldActivate={() => {}} />
    </div>
  ),
};

export const WithoutEmail: Story = {
  render: () => (
    <div style={{ maxWidth: 280 }}>
      <FieldPalette
        kinds={['signature', 'initials', 'date', 'text', 'checkbox']}
        onFieldDragStart={() => {}}
      />
    </div>
  ),
};

export const AllRequired: Story = {
  render: () => (
    <div style={{ maxWidth: 280 }}>
      <FieldPalette requiredKinds={FIELD_KINDS} onFieldDragStart={() => {}} />
    </div>
  ),
};

export const CustomHint: Story = {
  render: () => (
    <div style={{ maxWidth: 280 }}>
      <FieldPalette
        hint={
          <div
            style={{
              marginTop: 16,
              padding: 12,
              border: '1px dashed currentColor',
              borderRadius: 10,
              fontSize: 12,
            }}
          >
            Tip: press Enter to add a field at cursor.
          </div>
        }
      />
    </div>
  ),
};

function InsideRailDemo() {
  const [open, setOpen] = useState(true);
  const [width, setWidth] = useState(280);
  return (
    <div style={{ height: '100vh', display: 'flex' }}>
      <CollapsibleRail
        side="left"
        title="Fields"
        open={open}
        onOpenChange={setOpen}
        width={width}
        onWidthChange={setWidth}
        minW={200}
        maxW={360}
      >
        <FieldPalette onFieldDragStart={() => {}} />
      </CollapsibleRail>
    </div>
  );
}

export const InsideRail: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => <InsideRailDemo />,
};
