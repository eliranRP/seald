import type { Meta, StoryObj } from '@storybook/react-vite';
import type { JSX } from 'react';
import { useState } from 'react';
import { Button } from '@/components/Button';
import { LoadFailedState, LoadingOverlay, NotConfiguredState } from './states';
import { Backdrop } from './DrivePicker.styles';

/**
 * The actual Google picker iframe is rendered by Google's CDN and
 * cannot be captured in Chromatic — so the stories cover the three
 * visible-in-our-DOM surfaces only: loading, not-configured, and
 * load-failed. Once Google's picker takes over the viewport it sits
 * above any of these.
 */

interface DemoProps {
  readonly variant: 'loading' | 'not-configured' | 'load-failed';
}

function Demo({ variant }: DemoProps): JSX.Element {
  const [open, setOpen] = useState(true);
  if (!open) {
    return <Button onClick={() => setOpen(true)}>Re-open picker</Button>;
  }
  return (
    <Backdrop role="presentation">
      {variant === 'loading' ? <LoadingOverlay /> : null}
      {variant === 'not-configured' ? <NotConfiguredState onClose={() => setOpen(false)} /> : null}
      {variant === 'load-failed' ? (
        <LoadFailedState onRetry={() => undefined} onClose={() => setOpen(false)} />
      ) : null}
    </Backdrop>
  );
}

const meta: Meta<typeof Demo> = {
  title: 'L3/DrivePicker',
  component: Demo,
  tags: ['autodocs', 'layer-3'],
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof Demo>;

export const Loading: Story = {
  render: () => <Demo variant="loading" />,
};

export const NotConfigured: Story = {
  render: () => <Demo variant="not-configured" />,
};

export const LoadFailed: Story = {
  render: () => <Demo variant="load-failed" />,
};
