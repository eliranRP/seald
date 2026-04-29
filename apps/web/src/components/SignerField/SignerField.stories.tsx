import type { Meta, StoryObj } from '@storybook/react-vite';
import { SignerField } from './SignerField';
import type { SignerFieldKind } from './SignerField.types';

const meta: Meta<typeof SignerField> = {
  title: 'L2/SignerField',
  component: SignerField,
  tags: ['autodocs', 'layer-2'],
  parameters: { layout: 'centered' },
  args: {
    x: 10,
    y: 10,
    w: 220,
    h: 54,
    required: true,
    active: false,
    filled: false,
    onActivate: () => {
      /* story stub */
    },
  },
  decorators: [
    (Story) => (
      <div style={{ position: 'relative', width: 400, height: 160, background: '#fff' }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof SignerField>;

export const Signature: Story = { args: { kind: 'signature', label: 'Sign here' } };
export const SignatureFilled: Story = {
  args: { kind: 'signature', label: 'Sign here', filled: true, value: 'Maya Raskin' },
};
export const Initials: Story = { args: { kind: 'initials', label: 'Initials', w: 80 } };
export const DateField: Story = { args: { kind: 'date', label: 'Date', w: 140 } };
export const TextField: Story = { args: { kind: 'text', label: 'Job title' } };
export const EmailField: Story = { args: { kind: 'email', label: 'Email' } };
export const NameField: Story = { args: { kind: 'name', label: 'Full name' } };
export const Checkbox: Story = { args: { kind: 'checkbox', label: 'Agree', w: 24, h: 24 } };
export const CheckboxChecked: Story = {
  args: { kind: 'checkbox', label: 'Agree', w: 24, h: 24, filled: true, value: true },
};
export const Active: Story = {
  args: { kind: 'text', label: 'Next field', active: true },
};
export const Optional: Story = {
  args: { kind: 'text', label: 'Optional note', required: false },
};

export const AllTones: Story = {
  render: (args) => (
    <div style={{ position: 'relative', width: 900, height: 320, background: '#fff' }}>
      {(['signature', 'initials', 'date', 'text', 'email', 'name'] satisfies SignerFieldKind[]).map(
        (kind, i) => (
          <SignerField
            key={kind}
            {...args}
            kind={kind}
            label={kind}
            x={20 + (i % 3) * 260}
            y={20 + Math.floor(i / 3) * 80}
            w={220}
            h={54}
          />
        ),
      )}
    </div>
  ),
};
