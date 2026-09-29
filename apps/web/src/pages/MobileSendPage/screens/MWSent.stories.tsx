import type { Meta, StoryObj } from '@storybook/react-vite';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { MWSent } from './MWSent';
import type { MobileSigner } from '../types';

const SIGNERS: ReadonlyArray<MobileSigner> = [
  {
    id: 'signer-maya',
    name: 'Maya Lin',
    email: 'maya@example.com',
    color: '#4F46E5',
    initials: 'ML',
  },
  {
    id: 'signer-jonah',
    name: 'Jonah Park',
    email: 'jonah@example.com',
    color: '#F59E0B',
    initials: 'JP',
  },
];

function noop(): void {
  /* storybook stub */
}

const meta: Meta<typeof MWSent> = {
  title: 'L4/MWSent',
  component: MWSent,
  tags: ['autodocs', 'layer-4'],
  parameters: { layout: 'fullscreen', chromatic: { modes: chromaticViewportModes } },
  args: {
    title: 'Master Services Agreement',
    code: 'DOC-ABCD-1234',
    signers: SIGNERS,
    onView: noop,
    onAnother: noop,
  },
};
export default meta;
type Story = StoryObj<typeof MWSent>;

/** Mobile sent screen at 390px, matching the live `/m/send` width. */
export const Sent: Story = {
  render: (args) => (
    <div style={{ width: 390, maxWidth: '100%', margin: '0 auto', background: 'var(--paper)' }}>
      <MWSent {...args} />
    </div>
  ),
};

/** Same screen framed in a 1440px canvas. The component stays phone-width. */
export const Desktop: Story = {
  render: (args) => (
    <div style={{ width: 1440, maxWidth: '100%', background: 'var(--bg-app)' }}>
      <div style={{ width: 390, margin: '0 auto', background: 'var(--paper)' }}>
        <MWSent {...args} />
      </div>
    </div>
  ),
};
