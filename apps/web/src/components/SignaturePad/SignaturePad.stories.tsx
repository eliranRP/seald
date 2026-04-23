import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { SignaturePad } from './SignaturePad';
import type { SignaturePadMode, SignaturePadProps } from './SignaturePad.types';
import type { SignatureValue } from '../../types/sealdTypes';

const meta: Meta<typeof SignaturePad> = {
  title: 'L3/SignaturePad',
  component: SignaturePad,
  tags: ['autodocs', 'layer-3'],
};
export default meta;
type Story = StoryObj<typeof SignaturePad>;

type DemoProps = {
  readonly initialMode?: SignaturePadMode | undefined;
};

function previewLabel(value: SignatureValue): string {
  if (value.kind === 'typed') return `typed: "${value.text}"`;
  if (value.kind === 'drawn') return `drawn (${value.strokes} strokes)`;
  return `upload: ${value.fileName}`;
}

function Demo({ initialMode }: DemoProps) {
  const [last, setLast] = useState<SignatureValue | null>(null);
  const handleCommit: SignaturePadProps['onCommit'] = (value) => {
    setLast(value);
  };
  const handleCancel = (): void => {
    setLast(null);
  };
  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 560 }}>
      <SignaturePad initialMode={initialMode} onCommit={handleCommit} onCancel={handleCancel} />
      <div>Last commit: {last ? previewLabel(last) : 'none'}</div>
    </div>
  );
}

export const Default: Story = {
  render: () => <Demo />,
};

export const Typed: Story = {
  render: () => <Demo initialMode="type" />,
};

export const Drawn: Story = {
  render: () => <Demo initialMode="draw" />,
};

export const Upload: Story = {
  render: () => <Demo initialMode="upload" />,
};
