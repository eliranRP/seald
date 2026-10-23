import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DirectLink } from 'shared';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { DirectLinkDialog } from './DirectLinkDialog';
import { DirectLinkPanel } from './DirectLinkPanel';
import { directLinkKey } from './directLinksApi';
import { fakeLink, fakeTemplate } from './fixtures';

// The panel reads from the React Query cache, so seeding it keeps every story
// off the network.
function Wrap({
  link,
  children,
}: {
  readonly link: DirectLink | null;
  readonly children: ReactNode;
}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  qc.setQueryData(directLinkKey(fakeTemplate.id), link);
  return (
    <QueryClientProvider client={qc}>
      <div style={{ padding: 16, maxWidth: 560 }}>{children}</div>
    </QueryClientProvider>
  );
}

const meta: Meta<typeof DirectLinkPanel> = {
  title: 'L4/Templates/DirectLinkPanel',
  component: DirectLinkPanel,
  tags: ['autodocs', 'layer-4'],
  parameters: { chromatic: { modes: chromaticViewportModes } },
  args: { template: fakeTemplate },
};
export default meta;
type Story = StoryObj<typeof DirectLinkPanel>;

export const NoLinkYet: Story = {
  render: (args) => (
    <Wrap link={null}>
      <DirectLinkPanel {...args} />
    </Wrap>
  ),
};

export const NeedsExamplePdf: Story = {
  render: (args) => (
    <Wrap link={null}>
      <DirectLinkPanel template={{ ...args.template, hasExamplePdf: false }} />
    </Wrap>
  ),
};

export const LinkOn: Story = {
  render: (args) => (
    <Wrap link={fakeLink()}>
      <DirectLinkPanel {...args} />
    </Wrap>
  ),
};

export const LinkOff: Story = {
  render: (args) => (
    <Wrap link={fakeLink({ enabled: false, created_last_24h: 0 })}>
      <DirectLinkPanel {...args} />
    </Wrap>
  ),
};

export const InDialog: Story = {
  parameters: { layout: 'fullscreen', chromatic: { modes: chromaticViewportModes } },
  render: (args) => (
    <Wrap link={fakeLink()}>
      <DirectLinkDialog open template={args.template} onClose={() => undefined} />
    </Wrap>
  ),
};
