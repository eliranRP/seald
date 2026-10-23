import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { EmailChipsInput } from './EmailChipsInput';
import type { EmailChipsValue } from './EmailChipsInput.types';

const meta: Meta<typeof EmailChipsInput> = {
  title: 'L1/EmailChipsInput',
  component: EmailChipsInput,
  tags: ['autodocs', 'layer-1'],
};
export default meta;
type Story = StoryObj<typeof EmailChipsInput>;

const EXISTING: ReadonlySet<string> = new Set(['alex@quill.vc']);

function Stateful({ initial }: { readonly initial: EmailChipsValue }) {
  const [value, setValue] = useState(initial);
  return (
    <div style={{ maxWidth: 440 }}>
      <EmailChipsInput value={value} onChange={setValue} existingEmails={EXISTING} />
    </div>
  );
}

export const Empty: Story = {
  render: () => <Stateful initial={{ tokens: [], draft: '' }} />,
};

export const PastedList: Story = {
  render: () => (
    <Stateful
      initial={{
        tokens: ['nora@acme.co', 'tom@acme.co', 'kate@acme.co', 'alex@quill.vc', 'bad@@acme'],
        draft: '',
      }}
    />
  ),
};
