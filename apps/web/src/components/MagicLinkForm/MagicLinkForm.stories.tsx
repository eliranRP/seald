import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { AuthFormColumn } from '../AuthSplitLayout';
import { MagicLinkForm } from './MagicLinkForm';
import type { MagicLinkFormProps } from './MagicLinkForm.types';

function noop(): void {
  /* storybook stub */
}

function Stateful(props: Partial<MagicLinkFormProps> & { readonly initial?: string }) {
  const { initial = '', ...rest } = props;
  const [email, setEmail] = useState(initial);
  return (
    <AuthFormColumn>
      <MagicLinkForm
        email={email}
        onEmailChange={setEmail}
        onSubmit={noop}
        onGoogle={noop}
        onGuest={noop}
        {...rest}
      />
    </AuthFormColumn>
  );
}

const meta: Meta<typeof Stateful> = {
  title: 'L3/MagicLinkForm',
  component: Stateful,
  tags: ['autodocs', 'layer-3'],
  parameters: { layout: 'centered' },
};
export default meta;
type Story = StoryObj<typeof Stateful>;

export const Start: Story = {};
export const Typed: Story = { args: { initial: 'hannah@quill.vc' } };
export const Invalid: Story = { args: { initial: 'hannah@quill' } };
export const Sending: Story = { args: { initial: 'hannah@quill.vc', sending: true } };
export const LinkExpired: Story = {
  args: {
    initial: 'hannah@quill.vc',
    submitLabel: 'Email me a new link',
    notice: { tone: 'error', text: 'That sign-in link expired. Send a new one.' },
  },
};
export const FromSignerDone: Story = {
  args: {
    initial: 'hannah@quill.vc',
    notice: { tone: 'info', text: 'Save your signed document to your account' },
  },
};
export const RateLimited: Story = {
  args: {
    initial: 'hannah@quill.vc',
    locked: true,
    notice: { tone: 'error', text: 'Too many tries. Wait 60 s.' },
  },
};
