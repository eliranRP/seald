import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { PlacedField } from './PlacedField';
import type { PlacedFieldSigner, PlacedFieldValue } from './PlacedField.types';

const meta: Meta<typeof PlacedField> = {
  title: 'L2/PlacedField',
  component: PlacedField,
  tags: ['autodocs', 'layer-2'],
  parameters: { layout: 'centered' },
};
export default meta;
type Story = StoryObj<typeof PlacedField>;

const SIGNERS: ReadonlyArray<PlacedFieldSigner> = [
  { id: 's1', name: 'Ana Torres', color: '#F472B6' },
  { id: 's2', name: 'Ben Chen', color: '#34D399' },
];

function Canvas({
  children,
  width = 560,
  height = 320,
}: {
  readonly children: ReactNode;
  readonly width?: number;
  readonly height?: number;
}) {
  return (
    <div
      style={{
        position: 'relative',
        width,
        height,
        background: '#FFFFFF',
        border: '1px solid #E2E8F0',
        borderRadius: 12,
        boxShadow: '0 1px 2px rgba(15,23,42,0.06)',
      }}
    >
      {children}
    </div>
  );
}

const baseField: PlacedFieldValue = {
  id: 'f1',
  page: 0,
  type: 'signature',
  x: 80,
  y: 120,
  signerIds: [],
};

export const Unassigned: Story = {
  render: () => (
    <Canvas>
      <PlacedField field={{ ...baseField, signerIds: [] }} signers={SIGNERS} />
    </Canvas>
  ),
};

export const OneSigner: Story = {
  render: () => (
    <Canvas>
      <PlacedField field={{ ...baseField, signerIds: ['s1'] }} signers={SIGNERS} />
    </Canvas>
  ),
};

export const TwoSigners: Story = {
  render: () => (
    <Canvas>
      <PlacedField field={{ ...baseField, signerIds: ['s1', 's2'] }} signers={SIGNERS} />
    </Canvas>
  ),
};

export const Selected: Story = {
  render: () => (
    <Canvas>
      <PlacedField field={{ ...baseField, signerIds: ['s1'] }} signers={SIGNERS} selected />
    </Canvas>
  ),
};

export const InGroup: Story = {
  render: () => (
    <Canvas>
      <PlacedField field={{ ...baseField, signerIds: ['s1'] }} signers={SIGNERS} inGroup />
    </Canvas>
  ),
};

function PlaygroundDemo() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [field, setField] = useState<PlacedFieldValue>({
    id: 'f1',
    page: 0,
    type: 'signature',
    x: 80,
    y: 100,
    signerIds: ['s1'],
  });
  const [selected, setSelected] = useState(true);
  const [dragging, setDragging] = useState(false);

  return (
    <div ref={canvasRef} style={{ position: 'relative' }}>
      <Canvas>
        <PlacedField
          field={field}
          signers={SIGNERS}
          selected={selected}
          isDragging={dragging}
          canvasRef={canvasRef}
          onSelect={() => setSelected(true)}
          onDragStart={() => setDragging(true)}
          onDragEnd={() => setDragging(false)}
          onMove={(_id, x, y) => {
            setField((f) => ({ ...f, x, y }));
          }}
          onOpenSignerPopover={() => {}}
          onOpenPagesPopover={() => {}}
          onRemove={() => setSelected(false)}
        />
      </Canvas>
    </div>
  );
}

export const Playground: Story = {
  render: () => <PlaygroundDemo />,
};
