import type { Meta, StoryObj } from '@storybook/react-vite';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { MetaFieldDrawer } from './MetaFieldDrawer';

const meta: Meta<typeof MetaFieldDrawer> = {
  title: 'L3/MetaFieldDrawer',
  component: MetaFieldDrawer,
  tags: ['autodocs', 'layer-3'],
  parameters: { layout: 'fullscreen', chromatic: { modes: chromaticViewportModes } },
  args: { open: true, label: 'Field', onCancel: () => undefined, onApply: () => undefined },
};
export default meta;
type Story = StoryObj<typeof MetaFieldDrawer>;

const OPTIONS = [
  { label: 'Small', value: 's' },
  { label: 'Medium', value: 'm' },
  { label: 'Large', value: 'l' },
];

export const NamePrefilled: Story = {
  args: { kind: 'name', label: 'Full name', signerName: 'Maya Raskin' },
};

export const NumberWithRange: Story = {
  args: { kind: 'number', label: 'Seats', meta: { min: 1, max: 10 } },
};

export const NumberServerError: Story = {
  args: {
    kind: 'number',
    label: 'Seats',
    initialValue: '12',
    serverError: 'Enter a number from 1 to 10.',
  },
};

export const RadioGroup: Story = {
  args: { kind: 'radio', label: 'Size', meta: { options: OPTIONS, default: 'm' } },
};

export const Dropdown: Story = {
  args: { kind: 'dropdown', label: 'Plan', meta: { options: OPTIONS } },
};

export const DateInEnvelopeFormat: Story = {
  args: {
    kind: 'date',
    label: 'Start date',
    initialValue: '09/03/2026',
    dateFormat: 'dd/MM/yyyy',
  },
};

export const TextWithLimit: Story = {
  args: { kind: 'text', label: 'Note', meta: { char_limit: 120, placeholder: 'Anything to add?' } },
};
