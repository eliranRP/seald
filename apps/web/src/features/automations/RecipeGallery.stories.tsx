import type { Meta, StoryObj } from '@storybook/react-vite';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { RecipeGallery } from './RecipeGallery';
import type { RecipeCard } from './model';

const CARDS: readonly RecipeCard[] = [
  {
    id: 'sealed_save_drive',
    kind: 'drive',
    title: 'Save sealed copies to Drive',
    line: 'Every finished document lands in My Drive / Seald.',
  },
  {
    id: 'sealed_webhook',
    kind: 'webhook',
    title: 'Send a webhook when sealed',
    line: 'Post a signed message to your own address when a document is sealed.',
  },
  {
    id: 'completed_email_copy',
    kind: 'email',
    title: 'Email a copy when sealed',
    line: 'Get the finished document in your own inbox.',
  },
  {
    id: 'declined_notify_me',
    kind: 'email',
    title: 'Email me when someone declines',
    line: 'A short note the moment a signer declines.',
  },
];

const meta: Meta<typeof RecipeGallery> = {
  title: 'L3/Automations/RecipeGallery',
  component: RecipeGallery,
  tags: ['autodocs', 'layer-3'],
  parameters: { layout: 'fullscreen', chromatic: { modes: chromaticViewportModes } },
  args: { cards: CARDS, heading: 'Pick one to start', onUse: () => undefined },
  decorators: [
    (Story) => (
      <div style={{ padding: 16 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof RecipeGallery>;

export const Empty: Story = {};

export const OneSaving: Story = { args: { busyId: 'sealed_save_drive' } };

export const WithoutDrive: Story = { args: { cards: CARDS.slice(1), heading: 'Add another' } };
