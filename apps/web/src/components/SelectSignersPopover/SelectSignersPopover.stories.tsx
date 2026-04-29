import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import type { JSX } from 'react';
import { SelectSignersPopover } from './SelectSignersPopover';
import type {
  SelectSignersPopoverProps,
  SelectSignersPopoverSigner,
} from './SelectSignersPopover.types';
import { Button } from '../Button';
import { seald } from '../../styles/theme';

const SIGNERS: ReadonlyArray<SelectSignersPopoverSigner> = [
  { id: 's1', name: 'Alice Adams', color: seald.color.indigo[500] },
  { id: 's2', name: 'Bob Brown', color: seald.color.success[500] },
  { id: 's3', name: 'Carol Chen', color: seald.color.warn[500] },
  { id: 's4', name: 'David Diaz', color: seald.color.info[500] },
];

const meta: Meta<typeof SelectSignersPopover> = {
  title: 'L3/SelectSignersPopover',
  component: SelectSignersPopover,
  tags: ['autodocs', 'layer-3'],
};
export default meta;
type Story = StoryObj<typeof SelectSignersPopover>;

function Demo(args: {
  readonly initialOpen: boolean;
  readonly initialSelectedIds?: ReadonlyArray<string>;
}): JSX.Element {
  const { initialOpen, initialSelectedIds } = args;
  const [open, setOpen] = useState(initialOpen);
  const [applied, setApplied] = useState<ReadonlyArray<string> | null>(null);
  return (
    <div style={{ padding: 24, fontFamily: seald.font.sans }}>
      <Button onClick={() => setOpen(true)}>Open</Button>
      <div style={{ marginTop: 12, color: seald.color.fg[2] }}>
        Last applied: {applied ? applied.join(', ') : 'none'}
      </div>
      <SelectSignersPopover
        open={open}
        signers={SIGNERS}
        {...(initialSelectedIds ? { initialSelectedIds } : {})}
        onApply={(ids) => {
          setApplied(ids);
          setOpen(false);
        }}
        onCancel={() => setOpen(false)}
      />
    </div>
  );
}

export const Closed: Story = {
  render: () => <Demo initialOpen={false} />,
};

export const Open: Story = {
  render: () => <Demo initialOpen />,
};

export const Preselected: Story = {
  render: () => <Demo initialOpen initialSelectedIds={['s1']} />,
};

export const Playground: Story = {
  args: {
    open: true,
    signers: SIGNERS,
    title: 'Select signers',
    applyLabel: 'Apply',
    cancelLabel: 'Cancel',
  },
  render: (args: SelectSignersPopoverProps) => {
    function PlaygroundWrapper(): JSX.Element {
      const [open, setOpen] = useState(args.open);
      return (
        <div style={{ padding: 24, fontFamily: seald.font.sans }}>
          <Button onClick={() => setOpen(true)}>Open</Button>
          <SelectSignersPopover
            {...args}
            open={open}
            onApply={(ids) => {
              args.onApply(ids);
              setOpen(false);
            }}
            onCancel={() => {
              args.onCancel();
              setOpen(false);
            }}
          />
        </div>
      );
    }
    return <PlaygroundWrapper />;
  },
};
