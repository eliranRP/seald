import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { CollapsibleRail } from './CollapsibleRail';
import type { CollapsibleRailProps, CollapsibleRailSide } from './CollapsibleRail.types';
import { seald } from '../../styles/theme';

const meta: Meta<typeof CollapsibleRail> = {
  title: 'L3/CollapsibleRail',
  component: CollapsibleRail,
  tags: ['autodocs', 'layer-3'],
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof CollapsibleRail>;

const PLACEHOLDER_ROWS = Array.from({ length: 20 }, (_, i) => `Item ${i + 1}`);

function PlaceholderList(): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: seald.space[2] }}>
      {PLACEHOLDER_ROWS.map((row) => (
        <div
          key={row}
          style={{
            padding: `${seald.space[2]} ${seald.space[3]}`,
            border: `1px solid ${seald.color.border[1]}`,
            borderRadius: seald.radius.sm,
            fontFamily: seald.font.sans,
            fontSize: seald.font.size.bodySm,
            color: seald.color.fg[2],
          }}
        >
          {row}
        </div>
      ))}
    </div>
  );
}

function PageShell({ children }: { readonly children: React.ReactNode }): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        background: seald.color.bg.app,
        fontFamily: seald.font.sans,
      }}
    >
      {children}
    </div>
  );
}

function Interactive(props: {
  readonly side: CollapsibleRailSide;
  readonly title: string;
  readonly initialOpen: boolean;
  readonly initialWidth?: number;
  readonly noPad?: boolean;
}): JSX.Element {
  const { side, title, initialOpen, initialWidth = 280, noPad = false } = props;
  const [open, setOpen] = useState(initialOpen);
  const [width, setWidth] = useState(initialWidth);
  const rail = (
    <CollapsibleRail
      side={side}
      title={title}
      open={open}
      onOpenChange={setOpen}
      width={width}
      onWidthChange={setWidth}
      noPad={noPad}
    >
      <PlaceholderList />
    </CollapsibleRail>
  );
  const page = (
    <div
      style={{
        flex: 1,
        padding: seald.space[8],
        color: seald.color.fg[2],
      }}
    >
      Page content
    </div>
  );
  return <PageShell>{side === 'left' ? [rail, page] : [page, rail]}</PageShell>;
}

export const LeftOpen: Story = {
  render: () => <Interactive side="left" title="Fields" initialOpen />,
};

export const LeftCollapsed: Story = {
  render: () => <Interactive side="left" title="Fields" initialOpen={false} />,
};

export const RightOpen: Story = {
  render: () => <Interactive side="right" title="Ready to send" initialOpen noPad />,
};

export const Playground: Story = {
  args: {
    side: 'left',
    title: 'Fields',
    open: true,
    width: 280,
    minW: 200,
    maxW: 440,
    noPad: false,
  },
  render: (args: CollapsibleRailProps) => {
    function PlaygroundWrapper(): JSX.Element {
      const [open, setOpen] = useState(args.open);
      const [width, setWidth] = useState(args.width);
      return (
        <PageShell>
          <CollapsibleRail
            {...args}
            open={open}
            onOpenChange={setOpen}
            width={width}
            onWidthChange={setWidth}
          >
            <PlaceholderList />
          </CollapsibleRail>
          <div style={{ flex: 1, padding: seald.space[8], color: seald.color.fg[2] }}>
            Page content
          </div>
        </PageShell>
      );
    }
    return <PlaygroundWrapper />;
  },
};
